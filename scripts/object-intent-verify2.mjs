import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();
const { data: members } = await sb.from("members")
  .select("id, name, persona, backstory")
  .eq("current_location_world_id", world.id)
  .eq("status", "active").limit(3);

const labels = ["분수대", "벤치", "화분", "가로등", "나무"];
const apiKey = process.env.OPENAI_API_KEY;
for (const m of members) {
  const label = labels[Math.floor(Math.random() * labels.length)];
  const userPrompt = [
    `[상황: 광장에 ${label}가 보여요. 잠깐 그쪽으로 시선이 가서 한마디 흘립니다.]`,
    "(조용함)",
    "",
    `${label}에 대해 자기 결대로 한 줄. 카탈로그 설명 톤 X.`,
    "다음 중 하나의 결로:",
    "- 사소한 관찰 (방금 눈에 들어온 디테일)",
    "- 행동 의향 (다가가서 뭘 해볼까)",
    "- 즉흥 연상 (떠오른 옛 기억·기분)",
    "- 짧은 감탄/혼잣말",
    "오브제 자체에 머물지 말고 *내 감각*과 묶을 것. 예시 표현 따라하지 말고 직접 떠올려.",
    '- 정확히 1~2문장. 마침표/물음표/느낌표로 닫고 끝.',
  ].join("\n");
  const system = `너는 ${m.name}. ${m.persona?.affinity?.join(", ") ?? ""}. ${m.backstory ?? ""}`;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [
      { role: "system", content: system }, { role: "user", content: userPrompt },
    ], temperature: 1.0, max_tokens: 80 }),
  });
  const j = await r.json();
  console.log(`[${m.name} × ${label}] → ${j.choices?.[0]?.message?.content?.trim()}`);
}
process.exit(0);
