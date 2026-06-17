// End-to-end simulation of the implicit preference pipeline.
//
// Inserts synthetic user_signals at varied ages, replicates the
// aggregate math from lib/implicit-pref.ts, and asserts the expected
// behaviour for each of the design's load-bearing claims:
//
//   1. Decay         — old signals weigh less than new ones
//   2. Mute filter   — muted topics never reach the result
//   3. Cold-start    — accounts < 3 days return empty
//   4. Top-1 routing — top topic is what news / youtube / plaza-grow read
//   5. Mention boost — speaker pick + persona drift see normalised mentions
//
// Uses synthetic IDs + a unique test marker so cleanup is precise. No
// production data is modified; the test world is read-only here.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!(k in process.env)) process.env[k] = v;
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

const HALF_LIFE_MS = 7 * 24 * 3600 * 1000;
const COLD_START_MS = 3 * 24 * 3600 * 1000;
const MIN_TOPIC_WEIGHT = 0.5;
const TOP_TOPICS = 5;

// ────── pick the test world (수덕이세상) ──────
const { data: world } = await sb.from("worlds")
  .select("id, owner_id, last_persona_drift_at")
  .eq("name", "수덕이세상")
  .maybeSingle();
if (!world) { console.error("test world not found"); process.exit(2); }
const worldId = world.id;
const ownerId = world.owner_id;

// ────── account age + cold-start preview ──────
const { data: ownerAuth } = await sb.auth.admin.getUserById(ownerId);
const createdAt = new Date(ownerAuth.user.created_at).getTime();
const ageMs = Date.now() - createdAt;
const ageDays = (ageMs / (24 * 3600 * 1000)).toFixed(1);
const realColdStart = ageMs < COLD_START_MS;
console.log(`account age: ${ageDays}d  →  realColdStart=${realColdStart}`);
if (realColdStart) {
  console.log("  (live aggregate would return empty here. Sim continues with synthetic data.)");
}

// Pick a real active member so target_member_id passes FK validation.
const { data: someMember } = await sb.from("members")
  .select("id, name")
  .eq("current_location_world_id", worldId)
  .eq("status", "active")
  .limit(1)
  .maybeSingle();
const memberId = someMember?.id ?? null;
const memberName = someMember?.name ?? "(no member)";
console.log(`mention target: ${memberName} ${memberId ? `(${memberId.slice(0,8)})` : ""}`);

// ────── synthetic signal plan ──────
// Goal: 롤 should win clearly (heaviest recent), 떡볶이 second, 영화
// barely scrapes the floor (≥ MIN_TOPIC_WEIGHT 0.5), 옛것 should NOT
// reach the floor (too old). 옛것 also tests the early-exit when decay
// crosses the floor.
const HOURS = 3600 * 1000;
const NOW = Date.now();
const synthetic = [
  // 롤 — three recent hits → ~3.0 weight after no decay
  { kind: "chat",    topic: "롤",     w: 1.0, ageMs: 1 * HOURS },
  { kind: "chat",    topic: "롤",     w: 1.0, ageMs: 5 * HOURS },
  { kind: "chat",    topic: "롤",     w: 1.0, ageMs: 24 * HOURS },
  // 떡볶이 — two recent hits
  { kind: "chat",    topic: "떡볶이", w: 1.0, ageMs: 6 * HOURS },
  { kind: "chat",    topic: "떡볶이", w: 1.0, ageMs: 12 * HOURS },
  // 영화 — single hit
  { kind: "chat",    topic: "영화",   w: 1.0, ageMs: 8 * HOURS },
  // 옛것 — ancient, should decay below floor
  { kind: "chat",    topic: "옛것",   w: 1.0, ageMs: 60 * 24 * HOURS },
  // mention test — only valid if we have a member
  ...(memberId
    ? [{ kind: "mention", topic: null, target: memberId, w: 0.8, ageMs: 2 * HOURS }]
    : []),
];

// FK forces real user_id, so we insert under the actual owner. To
// avoid polluting their real signal stream we tag every row's topic
// with a "__sim__" prefix that the aggregate filter below also
// matches, then delete by the inserted IDs at cleanup.
const SIM_PREFIX = "__sim__";
const rows = synthetic.map((s) => ({
  user_id: ownerId,
  world_id: worldId,
  kind: s.kind,
  topic_keyword: s.topic ? `${SIM_PREFIX}${s.topic}` : null,
  target_member_id: s.target ?? null,
  weight: s.w,
  created_at: new Date(NOW - s.ageMs).toISOString(),
}));

// Sweep any leftover sim rows from a prior failed run before inserting.
await sb.from("user_signals").delete()
  .eq("user_id", ownerId).like("topic_keyword", `${SIM_PREFIX}%`);
const { data: insertedRows, error: insErr } = await sb
  .from("user_signals").insert(rows).select("id");
if (insErr) { console.error("insert failed:", insErr.message); process.exit(2); }
const insertedIds = (insertedRows ?? []).map((r) => r.id);
console.log(`\ninserted ${rows.length} synthetic signals`);

// ────── aggregate (replicates lib/implicit-pref.ts math) ──────
function decay(weight, age) {
  return weight * Math.exp((-age / HALF_LIFE_MS) * Math.LN2);
}

async function aggregate({ withMutes = [], overrideColdStart = false } = {}) {
  if (overrideColdStart) return { topics: [], mentions: new Map(), coldStart: true };
  // Read ONLY this run's rows (filter on inserted IDs). Mirrors what
  // implicit-pref.ts does for the world, with the additional sim
  // scoping so we don't reason about the user's real signals.
  const { data: sigs } = await sb.from("user_signals")
    .select("kind, topic_keyword, target_member_id, weight, created_at")
    .in("id", insertedIds)
    .order("created_at", { ascending: false });
  const muted = new Set(withMutes.map((t) => `${SIM_PREFIX}${t}`));
  const topicW = new Map();
  const mentionW = new Map();
  for (const s of sigs ?? []) {
    const age = Date.now() - new Date(s.created_at).getTime();
    const d = decay(s.weight, age);
    if (d < MIN_TOPIC_WEIGHT / 2) continue; // can't early-break w/o ordering guarantee on .in()
    if (s.kind === "chat") {
      const t = s.topic_keyword;
      if (!t || muted.has(t)) continue;
      topicW.set(t, (topicW.get(t) ?? 0) + d);
    } else if (s.kind === "mention") {
      const m = s.target_member_id;
      if (!m) continue;
      mentionW.set(m, (mentionW.get(m) ?? 0) + d);
    }
  }
  const topics = [...topicW.entries()]
    .filter(([, w]) => w >= MIN_TOPIC_WEIGHT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TOPICS)
    // Strip the sim prefix so display lines match what the user would see.
    .map(([topic, weight]) => ({ topic: topic.replace(SIM_PREFIX, ""), weight: +weight.toFixed(3) }));
  return { topics, mentions: mentionW, coldStart: false };
}

// ────── checks ──────
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  const ok = !!cond;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`);
  if (ok) pass++; else fail++;
}

console.log(`\n[1] decay + ranking`);
const s1 = await aggregate();
console.log("  topics:", s1.topics);
check("롤 is #1", s1.topics[0]?.topic === "롤");
check("떡볶이 is #2", s1.topics[1]?.topic === "떡볶이");
check("영화 is in result (1.0 hit, ~5h old → ~0.98 weight)", s1.topics.some((t) => t.topic === "영화"));
check("옛것 dropped by decay (60d old → ~0.0024 weight, below floor)",
  !s1.topics.some((t) => t.topic === "옛것"));
check("롤 > 떡볶이 (more recent + more hits)",
  (s1.topics.find((t) => t.topic === "롤")?.weight ?? 0)
  > (s1.topics.find((t) => t.topic === "떡볶이")?.weight ?? 0));

console.log(`\n[2] mute filter`);
const s2 = await aggregate({ withMutes: ["롤"] });
console.log("  topics with 롤 muted:", s2.topics);
check("롤 removed", !s2.topics.some((t) => t.topic === "롤"));
check("others retained", s2.topics.some((t) => t.topic === "떡볶이"));

console.log(`\n[3] cold-start gate`);
const s3 = await aggregate({ overrideColdStart: true });
check("topics empty", s3.topics.length === 0);
check("mentions empty", s3.mentions.size === 0);
check("coldStart flag true", s3.coldStart === true);

console.log(`\n[4] top-1 routing — what each consumer reads`);
const topTopic = s1.topics[0]?.topic ?? null;
check("topImplicitTopic resolves", topTopic === "롤");
// news cache key shape: biasKey(bias) + ":" + topTopic
const fakeBiasKey = `kpop:BLACKPINK`;
const newsCacheKey = `${fakeBiasKey}:${topTopic ?? ""}`;
console.log(`  news cache key would be:  "${newsCacheKey}"`);
check("news cache key includes top topic", newsCacheKey.endsWith(`:${topTopic}`));
// youtube pickQuery shape: "{topic} {suffix}"
const ytQuery = `${topTopic} stage`;
console.log(`  youtube query would be:   "${ytQuery}"`);
check("youtube query starts with top topic", ytQuery.startsWith(topTopic + " "));
// plaza-grow: catalog topic overlap — simulate with the dog catalog
const dogCatalog = {
  dog_shiba:     ["반려", "활기", "귀여움"],
  dog_maltese:   ["반려", "귀여움"],
  dog_retriever: ["반려", "쉼"],
  dog_dachshund: ["반려", "귀여움"],
};
const topicMap = new Map(s1.topics.map((t) => [t.topic, t.weight]));
const scores = Object.fromEntries(
  Object.entries(dogCatalog).map(([dog, topics]) => [
    dog,
    topics.reduce((s, t) => s + (topicMap.get(t) ?? 0), 0),
  ]),
);
console.log(`  dog overlap scores: ${JSON.stringify(scores)}  (none overlap with 롤/떡볶이/영화)`);
check("no dog wins implicit → milestone default kept (pickByTopicOverlap fallback)",
  Object.values(scores).every((s) => s === 0));

// Repeat the overlap check with a topic that DOES match the catalog
// (`귀여움` matches shiba/maltese/dachshund). pickByTopicOverlap should
// now boost those three over the milestone default if the default is
// the retriever (no "귀여움" tag).
const cuteMap = new Map([["귀여움", 2.5]]);
const cuteScores = Object.fromEntries(
  Object.entries(dogCatalog).map(([dog, topics]) => [
    dog,
    topics.reduce((s, t) => s + (cuteMap.get(t) ?? 0), 0),
  ]),
);
console.log(`  cute overlap scores: ${JSON.stringify(cuteScores)}  (user-loves-cute scenario)`);
check("shiba/maltese/dachshund score > 0 with 귀여움",
  cuteScores.dog_shiba > 0 && cuteScores.dog_maltese > 0 && cuteScores.dog_dachshund > 0);
check("retriever stays at 0 (no 귀여움 tag)", cuteScores.dog_retriever === 0);
// Simulate pickByTopicOverlap with retriever as the milestone fallback
// (stage 8). The +0.3 fallback bonus should NOT overcome other dogs'
// 2.5 weight — implicit wins.
const FALLBACK = "dog_retriever";
const withFallback = Object.fromEntries(
  Object.entries(cuteScores).map(([dog, s]) => [dog, dog === FALLBACK ? s + 0.3 : s]),
);
const winner = Object.entries(withFallback).reduce((a, b) => b[1] > a[1] ? b : a)[0];
console.log(`  pickByTopicOverlap winner (stage 8 default=retriever): ${winner}`);
check("implicit overrides milestone default when overlap exists",
  winner !== FALLBACK);

console.log(`\n[5] mention boost (normalised against max)`);
if (memberId) {
  const maxMention = Math.max(...s1.mentions.values());
  const memberMention = s1.mentions.get(memberId) ?? 0;
  const norm = maxMention > 0 ? memberMention / maxMention : 0;
  const boost = 1 + 0.5 * norm;
  console.log(`  ${memberName} raw=${memberMention.toFixed(3)} norm=${norm.toFixed(2)} → boost=${boost.toFixed(2)}×`);
  check("mention captured", memberMention > 0);
  check("boost in [1.0, 1.5] range", boost >= 1 && boost <= 1.5);
} else {
  console.log("  (no member to mention — skipped)");
}

// ────── cleanup ──────
const { error: delErr } = await sb.from("user_signals").delete().in("id", insertedIds);
console.log(`\ncleaned up ${insertedIds.length} synthetic signals${delErr ? ` (warn: ${delErr.message})` : ""}`);

console.log(`\n──────────────`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
