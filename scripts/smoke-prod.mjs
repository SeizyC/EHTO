#!/usr/bin/env node
// Post-deploy smoke test against the live CF Worker.
//
// Verifies:
//   1. Worker responds (basic /api/world/info)
//   2. /api/cron/ambient endpoint authenticates + returns OK
//   3. Each world's ambient pipeline (activations / rotation / ambient /
//      music / growth) actually runs in that endpoint
//   4. If we're currently inside a music slot window (KST 8-11, 12-14,
//      19-22), the corresponding `worlds.last_music_<slot>_at` should
//      eventually become non-null for active worlds — we report on it
//      so a permanently-empty stamp is visible
//
// Doesn't run automatically (smoke can be slow + uses prod credentials).
// Run manually after a deploy when you want confidence things actually
// fire end-to-end:  `npm run smoke`

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

const APP_URL = process.env.APP_URL ?? "https://ehto.hans1329.workers.dev";
const cronSecret = process.env.CRON_SECRET;
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!cronSecret) { console.error("CRON_SECRET missing"); process.exit(2); }
if (!supaUrl || !supaKey) { console.error("Supabase creds missing"); process.exit(2); }

let exitCode = 0;
function fail(msg) { console.error(`✗ FAIL: ${msg}`); exitCode = 1; }
function ok(msg) { console.log(`✓ ${msg}`); }
function warn(msg) { console.warn(`⚠ WARN: ${msg}`); }

function kstHour() {
  return new Date(Date.now() + 9 * 3600_000).getUTCHours();
}
function currentSlot() {
  const h = kstHour();
  if (h >= 8 && h < 11) return "morning";
  if (h >= 12 && h < 14) return "lunch";
  if (h >= 19 && h < 22) return "evening";
  return null;
}
function kstDateLabel() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return d.toISOString().slice(0, 10);
}

// ─── 1. Worker liveness ───
console.log(`=== smoke against ${APP_URL} ===`);
console.log("");
console.log("→ worker liveness");
const live = await fetch(`${APP_URL}/`);
if (live.ok) ok(`${APP_URL}/ responded ${live.status}`);
else fail(`worker not responding: ${live.status}`);

// ─── 2. Cron endpoint ───
console.log("");
console.log("→ cron endpoint");
const t0 = Date.now();
const cronResp = await fetch(`${APP_URL}/api/cron/ambient`, {
  headers: { Authorization: `Bearer ${cronSecret}` },
});
const cronMs = Date.now() - t0;
if (!cronResp.ok) {
  fail(`cron endpoint HTTP ${cronResp.status}`);
} else {
  const cron = await cronResp.json();
  ok(`cron OK (${cronMs}ms, ${cron.worlds} worlds)`);
  // Show per-world outcomes
  for (const r of cron.results ?? []) {
    const bits = [];
    if (r.activated) bits.push(`activated:${r.activated}`);
    if (r.departed) bits.push(`departed:${r.departed}`);
    if (r.spoke) bits.push(`spoke:${r.spoke}`);
    if (r.music) bits.push(`music:${r.music.slice(0, 40)}`);
    if (r.grew) bits.push(`grew:${r.grew}`);
    if (r.error) bits.push(`error:${r.error}`);
    console.log(`    ${r.worldId.slice(0, 8)} → ${bits.length > 0 ? bits.join(" ") : r.reason ?? "noop"}`);
  }
}

// ─── 3. Music slot status via Supabase ───
console.log("");
console.log("→ music slot status");
const slot = currentSlot();
console.log(`  current KST: ${new Date(Date.now() + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 19)} (slot: ${slot ?? "outside-slot"})`);
const today = kstDateLabel();

const worldsResp = await fetch(
  `${supaUrl}/rest/v1/worlds?select=id,name,last_music_morning_at,last_music_lunch_at,last_music_evening_at&order=created_at.desc`,
  { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
);
if (!worldsResp.ok) {
  fail(`supabase query: ${worldsResp.status}`);
} else {
  const worlds = await worldsResp.json();
  for (const w of worlds) {
    const stamps = ["morning", "lunch", "evening"].map((s) => {
      const v = w[`last_music_${s}_at`];
      if (!v) return `${s}:×`;
      const kstDate = new Date(new Date(v).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
      return `${s}:${kstDate === today ? "✓today" : kstDate}`;
    });
    console.log(`    ${w.id.slice(0, 8)} "${(w.name ?? "(unnamed)").slice(0, 20)}" → ${stamps.join(" / ")}`);
  }
  // If we're in a slot and no world has stamped TODAY for that slot,
  // warn — music probably not flowing through to prod yet.
  if (slot) {
    const slotKey = `last_music_${slot}_at`;
    const anyFired = worlds.some((w) => {
      const v = w[slotKey];
      if (!v) return false;
      const kstDate = new Date(new Date(v).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
      return kstDate === today;
    });
    if (!anyFired) {
      warn(`in ${slot} slot but no world fired music today — check cron path / 12% jitter rolls`);
    } else {
      ok(`at least one world fired ${slot} music today`);
    }
  }
}

// ─── 4. Recent messages snapshot ───
console.log("");
console.log("→ recent messages (last 5 across all worlds)");
const msgsResp = await fetch(
  `${supaUrl}/rest/v1/messages?select=text,kind,owner_user_id,owner_member_id,created_at,members(name)&order=created_at.desc&limit=5`,
  { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
);
if (msgsResp.ok) {
  const msgs = await msgsResp.json();
  for (const m of msgs.reverse()) {
    const who = m.kind === "system" ? "[sys]"
      : m.kind === "recap" ? "[recap]"
      : m.owner_user_id ? "[user]"
      : `[${m.members?.name ?? "?"}]`;
    const t = new Date(m.created_at).toISOString().slice(11, 19);
    console.log(`    ${t}Z ${who} ${m.text.slice(0, 60)}`);
  }
}

console.log("");
process.exit(exitCode);
