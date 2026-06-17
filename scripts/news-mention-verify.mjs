// Run 10 ambient ticks back-to-back, then count how many lines reference
// any of today's news headlines. With the system prompt's "오늘 광장 밖
// 화제" block, persona-relevant items should surface organically without
// flooding every line.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();

// Make sure ambient is open for this world.
await sb.from("worlds").update({
  last_owner_active_at: new Date().toISOString(),
  last_ambient_at: null,
}).eq("id", world.id);

// Seed a quiet line so the loop has something to react to.
const { data: members } = await sb.from("members")
  .select("id, name").eq("current_location_world_id", world.id).eq("status", "active").limit(1);
const { data: seed } = await sb.from("messages").insert({
  world_id: world.id, owner_member_id: members[0].id,
  text: "오늘 좀 조용하네", created_at: new Date(Date.now() - 90_000).toISOString(),
}).select("id, created_at").single();

const created = [seed.id];
for (let i = 0; i < 10; i++) {
  await sb.from("worlds").update({ last_ambient_at: null }).eq("id", world.id);
  const r = await fetch("http://localhost:3001/api/cron/ambient");
  await r.json();
  await new Promise(r => setTimeout(r, 500));
}
const { data: lines } = await sb.from("messages")
  .select("id, text, members!inner(name)")
  .eq("world_id", world.id)
  .gt("created_at", seed.created_at)
  .not("owner_member_id", "is", null)
  .order("created_at", { ascending: true });

console.log(`Generated ${lines?.length ?? 0} ambient lines:\n`);
for (const l of lines ?? []) {
  console.log(`  [${l.members.name}] ${l.text}`);
  created.push(l.id);
}

// Cleanup
await sb.from("messages").delete().in("id", created);
