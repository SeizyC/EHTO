// End-to-end: insert a user message → verify ambient tick fires → AI reply
// appears via realtime. Uses service role to insert + subscribe (bypasses
// RLS); calls /api/cron/ambient to simulate the server-side trigger that
// POST /api/messages now performs internally.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();
console.log("world", world.id);

// Clear ambient lock so the immediate tick can claim it.
await sb.from("worlds").update({ last_ambient_at: null }).eq("id", world.id);

sb.realtime.setAuth(SERVICE);
const events = [];
const ch = sb.channel(`amb-vfy:${world.id}`).on("postgres_changes",
  { event: "INSERT", schema: "public", table: "messages", filter: `world_id=eq.${world.id}` },
  (p) => {
    events.push({ at: Date.now(), row: p.new });
    const who = p.new.owner_user_id ? "user" : (p.new.owner_member_id ? `member:${p.new.owner_member_id.slice(0,8)}` : "system");
    console.log(`  [rt] ${who}: ${String(p.new.text).slice(0,80)}`);
  });
await new Promise((res) => ch.subscribe((s) => { if (s === "SUBSCRIBED") res(); }));

const t0 = Date.now();
const text = `오늘 다들 뭐해? (rt test ${new Date().toISOString().slice(11,19)})`;
console.log("\n→ inserting user message:", text);
const ins = await sb.from("messages").insert({
  world_id: world.id, owner_user_id: me.id, text,
}).select("id").single();
const userMsgId = ins.data.id;

// Simulate what POST /api/messages now does: kick the ambient tick.
console.log("→ triggering ambient via /api/cron/ambient");
const r = await fetch(`http://localhost:3001/api/cron/ambient`, {
  headers: CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {},
});
console.log("  cron status:", r.status, await r.text().then(t => t.slice(0,200)));

// Wait up to 15s for AI reply via realtime.
const deadline = Date.now() + 15_000;
while (Date.now() < deadline) {
  if (events.find((e) => e.row.owner_member_id && e.at > t0)) break;
  await new Promise((r) => setTimeout(r, 200));
}
const reply = events.find((e) => e.row.owner_member_id && e.at > t0);
console.log("\n=== RESULT ===");
console.log("user msg pushed via rt:", events.find((e) => e.row.id === userMsgId) ? "yes" : "NO");
console.log("AI reply pushed via rt:", reply ? `yes (+${reply.at - t0}ms): ${reply.row.text}` : "NO");

// Cleanup the test user msg + AI reply.
const ids = [userMsgId];
if (reply) ids.push(reply.row.id);
await sb.from("messages").delete().in("id", ids);
sb.removeAllChannels();
process.exit(reply ? 0 : 1);
