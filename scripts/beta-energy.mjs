#!/usr/bin/env node
// Beta tuning report for the daily-energy + capacity numbers.
//
// Reads the persisted state directly (no log scraping needed): today's
// moments usage per plaza and live resident counts. Answers the two
// questions that decide whether 120 moments / 30s cadence / 6-resident free
// cap are right:
//   1. Are free plazas hitting the 120 cap? how many, how hard?
//   2. Is capacity (free 6 / Plus 12) actually being filled?
//
// Pair with the prod `[beta] cap-reached ...` log lines (timestamps show
// *when* a plaza depleted → depletion speed). Usage: node scripts/beta-energy.mjs

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!(k in process.env)) process.env[k] = v;
}

// Caps mirror src/lib/energy.ts — keep in sync.
const MOMENT_CAP = { free: 120, plus: 100_000 };
const MEMBER_CAP = { free: 6, plus: 12 };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

function stats(nums) {
  if (nums.length === 0) return { n: 0, avg: 0, median: 0, max: 0 };
  const s = [...nums].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, avg: +(sum / s.length).toFixed(1), median: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
}

const { data: worlds, error: wErr } = await sb
  .from("worlds")
  .select("id, plan, moments_used, moments_day");
if (wErr) { console.error("worlds:", wErr.message); process.exit(1); }

const { data: members, error: mErr } = await sb
  .from("members")
  .select("current_location_world_id, status, activated_at");
if (mErr) { console.error("members:", mErr.message); process.exit(1); }

const activeByWorld = new Map();
for (const m of members ?? []) {
  if (m.activated_at == null) continue;
  if (m.status === "ghost" || m.status === "banned") continue;
  activeByWorld.set(m.current_location_world_id, (activeByWorld.get(m.current_location_world_id) ?? 0) + 1);
}

console.log(`\n=== EHTO beta-energy report · KST ${today} ===\n`);
for (const plan of ["free", "plus"]) {
  const ws = (worlds ?? []).filter((w) => (w.plan ?? "free") === plan);
  if (ws.length === 0) { console.log(`[${plan}] no worlds\n`); continue; }
  const usedToday = ws.map((w) => (w.moments_day === today ? (w.moments_used ?? 0) : 0));
  const capHit = usedToday.filter((u) => u >= MOMENT_CAP[plan]).length;
  const us = stats(usedToday);
  const active = ws.map((w) => activeByWorld.get(w.id) ?? 0);
  const as = stats(active);
  const atMemberCap = active.filter((a) => a >= MEMBER_CAP[plan]).length;
  console.log(`[${plan}] worlds=${ws.length}`);
  console.log(`  moments today : avg ${us.avg} · median ${us.median} · max ${us.max} / cap ${MOMENT_CAP[plan]}`);
  console.log(`  hit cap today : ${capHit}/${ws.length} (${Math.round((capHit / ws.length) * 100)}%)`);
  console.log(`  residents     : avg ${as.avg} · max ${as.max} / cap ${MEMBER_CAP[plan]} · at cap ${atMemberCap}/${ws.length}`);
  console.log("");
}
console.log("Tuning: many hitting cap early → raise/loosen; few ever hitting → cap is loose (weak conversion).\n");
