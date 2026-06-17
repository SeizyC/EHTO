// Realtime path verification (service-role; bypasses RLS):
//   1. Pick the 1@1.com user's world.
//   2. Subscribe to messages INSERT filtered to that world.
//   3. Insert a fake user message via service role.
//   4. Confirm we receive the INSERT push within 3s.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.error("missing env"); process.exit(2); }
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
if (!me) { console.error("1@1.com not found"); process.exit(2); }

const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();
if (!world) { console.error("no world"); process.exit(2); }
console.log("world", world.id);

sb.realtime.setAuth(SERVICE);

const events = [];
const ch = sb.channel(`vfy:${world.id}`)
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "messages", filter: `world_id=eq.${world.id}` },
    (p) => {
      events.push({ at: Date.now(), row: p.new });
      const who = p.new.owner_user_id ? "user" : (p.new.owner_member_id ? "member" : "system");
      console.log(`[rt INSERT ${who}] ${String(p.new.text).slice(0,60)}`);
    });
await new Promise((res, rej) => {
  ch.subscribe((s) => {
    console.log("[rt status]", s);
    if (s === "SUBSCRIBED") res();
    if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") rej(new Error(s));
  });
});

const t0 = Date.now();
const text = `RT-VERIFY ${new Date().toISOString().slice(11,19)}`;
const ins = await sb.from("messages").insert({
  world_id: world.id, owner_user_id: me.id, text,
}).select("id").single();
if (ins.error) { console.error("insert failed:", ins.error.message); process.exit(2); }
console.log(`inserted (${Date.now() - t0}ms):`, ins.data.id);

const deadline = Date.now() + 5_000;
while (Date.now() < deadline) {
  if (events.find((e) => e.row.text === text)) break;
  await new Promise((r) => setTimeout(r, 100));
}
const hit = events.find((e) => e.row.text === text);
if (!hit) { console.error("DID NOT RECEIVE INSERT VIA REALTIME"); process.exit(1); }
console.log(`OK — realtime delivered insert in ${hit.at - t0}ms`);

// Cleanup
await sb.from("messages").delete().eq("id", ins.data.id);
sb.removeAllChannels();
process.exit(0);
