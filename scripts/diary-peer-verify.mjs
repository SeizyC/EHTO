// Run summarizeMemberDay on TODAY's window for 3 active members and
// inspect whether peer names appear in their generated diary lines.
// (Phase 2's payoff actually shows tomorrow when these traces get
// injected into the system prompt, but we can validate the prompt
// change end-to-end today.)
import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.OPENAI_API_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();
const { data: members } = await sb.from("members")
  .select("id, name, persona, backstory")
  .eq("current_location_world_id", world.id)
  .eq("status", "active")
  .limit(3);

// Mimic the new summarizeMemberDay logic.
async function summarize(member) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const { data: msgs } = await sb.from("messages")
    .select("text, owner_user_id, owner_member_id, members(name)")
    .eq("world_id", world.id)
    .gte("created_at", today.toISOString())
    .lt("created_at", tomorrow.toISOString())
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = msgs ?? [];
  const ownLines = rows.filter(r => r.owner_member_id === member.id);
  if (ownLines.length === 0) return `(${member.name}: 오늘 발언 없음)`;

  const peerNames = new Set();
  for (const r of rows) {
    if (!r.owner_member_id || r.owner_member_id === member.id) continue;
    const n = Array.isArray(r.members) ? r.members[0]?.name : r.members?.name;
    if (n) peerNames.add(n);
  }
  const peerList = [...peerNames];

  const transcript = rows.map(r => {
    if (r.owner_member_id === member.id) return `[나] ${r.text}`;
    if (r.owner_user_id) return `[방장] ${r.text}`;
    const n = Array.isArray(r.members) ? r.members[0]?.name : r.members?.name;
    return `[${n ?? "다른 멤버"}] ${r.text}`;
  }).join("\n");

  const system = [
    `당신은 ${member.name}, 가상의 광장 멤버.`,
    member.persona?.affinity ? `관심사: ${member.persona.affinity.join(", ")}` : "",
    member.persona?.speech_style ? `말투: ${member.persona.speech_style}` : "",
    member.backstory ? `배경: ${member.backstory}` : "",
  ].filter(Boolean).join("\n");

  const peerHint = peerList.length > 0
    ? `오늘 같이 있던 사람들: ${peerList.join(", ")}.`
    : "오늘 다른 멤버는 거의 없었음.";

  const userPrompt = [
    `[작업: 오늘 하루의 광장 대화. [나] 입장에서 1줄 회상.]`,
    peerHint,
    "",
    transcript,
    "",
    "회상 한 줄을 1인칭 평어로. 예:",
    `- "강변 따라 10km 뛰고 막걸리집 들름."`,
    `- "시연이랑 야근 얘기로 짠해했음."`,
    "",
    "규칙: 한 줄 40자 이내. 1인칭 평어. 다른 멤버랑 의미 있게 주고받은 게 있으면 이름+토픽 포함.",
  ].join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{role:"system",content:system},{role:"user",content:userPrompt}],
      max_tokens: 80, temperature: 0.7,
    }),
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() ?? "(null)";
}

for (const m of members) {
  const text = await summarize(m);
  console.log(`[${m.name}] → ${text}`);
}
