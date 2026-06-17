// Drive 8 ambient ticks back-to-back (no user input) and watch whether
// consecutive AI lines actually reference each other vs each just
// monologuing about themselves. We seed one opening line, then let the
// loop run. With Phase 1 bias toward reply-peer (85% when peer just
// spoke), most successive lines should build on the previous.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();
const { data: members } = await sb.from("members")
  .select("id, name").eq("current_location_world_id", world.id).eq("status", "active").limit(1);
const seedMember = members[0];

// Reset state and seed an opening line.
await sb.from("worlds").update({ last_ambient_at: null }).eq("id", world.id);
const seedText = "오늘 막걸리 진짜 끝내준다 ㅋㅋ 강변에서 한잔 했는데 노을이랑 같이 들이켰어";
const { data: seed } = await sb.from("messages")
  .insert({
    world_id: world.id, owner_member_id: seedMember.id, text: seedText,
    created_at: new Date(Date.now() - 5000).toISOString(),
  }).select("id, created_at").single();
console.log(`SEED [${seedMember.name}] → ${seedText}\n`);

const createdIds = [seed.id];
const seenIds = new Set([seed.id]);

for (let i = 0; i < 8; i++) {
  await sb.from("worlds").update({ last_ambient_at: null }).eq("id", world.id);
  const r = await fetch("http://localhost:3001/api/cron/ambient");
  await r.json();
  // Wait a beat for the insert to settle
  await new Promise(r => setTimeout(r, 400));
  const { data: latest } = await sb.from("messages")
    .select("id, text, owner_member_id, members!inner(name)")
    .eq("world_id", world.id)
    .gt("created_at", seed.created_at)
    .order("created_at", { ascending: false }).limit(1);
  const row = latest?.[0];
  if (!row || seenIds.has(row.id)) {
    console.log(`  tick ${i+1}: (no new line)`);
    continue;
  }
  seenIds.add(row.id);
  createdIds.push(row.id);
  console.log(`  tick ${i+1} [${row.members.name}] → ${row.text}`);
}

// Cleanup
await sb.from("messages").delete().in("id", createdIds);
process.exit(0);
