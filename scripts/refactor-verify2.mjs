// E2E verify against the live API. Tests the original failure cases
// after model swap to gpt-4.1-mini + simplified system prompt with the
// new "chatroom conversation" baseline.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();

// Pick 4 distinct active members
const { data: members } = await sb.from("members")
  .select("id, name, activated_at, persona")
  .eq("current_location_world_id", world.id)
  .eq("status", "active")
  .not("activated_at", "is", null)
  .limit(4);

const provocations = [
  "너 여기 언제 왔어?",
  "취미가 뭐야?",
  "야 왜 그렇게 못생겼어?",
  "오늘 뭐했어?",
];

for (const q of provocations) {
  console.log(`\n=== Q: "${q}" ===`);
  for (const m of members) {
    await sb.from("worlds").update({ last_ambient_at: null }).eq("id", world.id);
    const t = `@${m.name} ${q}`;
    const { data: msg } = await sb.from("messages")
      .insert({ world_id: world.id, owner_user_id: me.id, text: t })
      .select("id, created_at").single();
    await new Promise(r => setTimeout(r, 700));
    const r = await fetch("http://localhost:3001/api/cron/ambient");
    await r.json();
    const { data: replies } = await sb.from("messages")
      .select("id, text, owner_member_id, members!inner(name)")
      .eq("world_id", world.id)
      .gt("created_at", msg.created_at)
      .not("owner_member_id", "is", null)
      .order("created_at", { ascending: true });
    const ours = replies?.find(r => r.owner_member_id === m.id);
    console.log(`  [${m.name}] → ${ours?.text ?? "(no reply)"}`);
    const ids = [msg.id, ...(replies?.map(r => r.id) ?? [])].filter(Boolean);
    if (ids.length) await sb.from("messages").delete().in("id", ids);
  }
}
