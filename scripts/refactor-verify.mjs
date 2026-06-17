// End-to-end verification of the refactor. Hits the live /api/cron/ambient
// endpoint (which uses the real generateAmbientLine with gpt-4o and the
// new simplified system prompt) after seeding a transcript that forces
// each scenario.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();

// Find one member who joined "today" (weekendrun) — they should say
// today/방금 when asked when they came.
const { data: members } = await sb.from("members")
  .select("id, name, activated_at")
  .eq("current_location_world_id", world.id)
  .eq("status", "active")
  .not("activated_at", "is", null)
  .order("activated_at", { ascending: false })
  .limit(20);

console.log("members + ago:");
function ago(t) {
  if (!t) return null;
  const ms = Date.now() - new Date(t).getTime();
  const day = Math.floor(ms / 86400000);
  return day === 0 ? "today" : `${day}d ago`;
}
members.forEach(m => console.log(`  ${m.name.padEnd(15)} ${ago(m.activated_at)}`));

const todayMember = members.find(m => Math.abs(Date.now() - new Date(m.activated_at)) < 86400000);
const yesterdayMember = members.find(m => {
  const d = (Date.now() - new Date(m.activated_at)) / 86400000;
  return d > 0.5 && d < 2;
});

const CASES = [
  { label: "joined TODAY + summon + 언제 왔어?", member: todayMember, text: `@${todayMember?.name} 너 여기 언제 왔어?` },
  { label: "joined yesterday + summon + 언제 왔어?", member: yesterdayMember, text: yesterdayMember ? `@${yesterdayMember.name} 너 여기 언제 왔어?` : null },
  { label: "summon + insult", member: yesterdayMember, text: yesterdayMember ? `@${yesterdayMember.name} 너 왜 그렇게 못생겼어?` : null },
  { label: "summon + benign curiosity", member: yesterdayMember, text: yesterdayMember ? `@${yesterdayMember.name} 취미가 뭐야?` : null },
  { label: "summon + intrusive but normal Korean", member: yesterdayMember, text: yesterdayMember ? `@${yesterdayMember.name} 몇 살이야?` : null },
];

async function run(test) {
  if (!test.text || !test.member) { console.log(`\n[SKIP] ${test.label} — no member`); return; }
  console.log(`\n=== ${test.label} ===`);
  console.log(`  speaker: ${test.member.name} (joined: ${ago(test.member.activated_at)})`);
  console.log(`  user: "${test.text}"`);
  // Clear lock + insert user msg
  await sb.from("worlds").update({ last_ambient_at: null }).eq("id", world.id);
  const { data: msg } = await sb.from("messages")
    .insert({ world_id: world.id, owner_user_id: me.id, text: test.text })
    .select("id, created_at").single();
  // Wait grace period (600ms for mention) + give ambient tick time
  await new Promise(r => setTimeout(r, 800));
  const r = await fetch("http://localhost:3001/api/cron/ambient");
  const j = await r.json();
  const result = j.results.find(rr => rr.worldId === world.id);
  // Pull the actual reply
  const { data: replies } = await sb.from("messages")
    .select("text, owner_member_id, members!inner(name)")
    .eq("world_id", world.id)
    .gt("created_at", msg.created_at)
    .not("owner_member_id", "is", null)
    .order("created_at", { ascending: true });
  console.log(`  cron: ${result?.spoke ?? "—"} (${result?.reason ?? "?"})`);
  if (replies?.length) {
    replies.forEach(rep => console.log(`  REPLY [${rep.members.name}] → ${rep.text}`));
  } else {
    console.log("  REPLY (none — try again)");
  }
  // Cleanup: delete user msg + replies
  const ids = [msg.id, ...(replies?.map(r => r.id) ?? [])].filter(Boolean);
  if (ids.length) await sb.from("messages").delete().in("id", ids);
}

for (const test of CASES) await run(test);
process.exit(0);
