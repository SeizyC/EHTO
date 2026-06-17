// Direct test of the new SpeechIntent branch: import the generator and
// force `object-interaction` so we can see what the LLM produces without
// fighting upstream probability gates.
import { createClient } from "@supabase/supabase-js";
// Use a dynamic import so we don't need to compile TS.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Grab a real member from the test world.
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();
const { data: member } = await sb.from("members")
  .select("id, name, persona, backstory, activity_weight, status")
  .eq("current_location_world_id", world.id)
  .eq("status", "active").limit(1).single();
console.log("speaker:", member.name);

// We can't easily import the TS module from a .mjs script, but we can
// invoke the same fetch() the function makes. Replicate the prompt
// construction in-line to confirm gpt-4o-mini returns a plausible line.
const apiKey = process.env.OPENAI_API_KEY;
const labels = ["분수대", "벤치", "화분", "가로등", "나무"];
for (const label of labels) {
  const userPrompt = [
    `[상황: 광장에 ${label}가 보여요. 잠깐 그쪽으로 시선이 가서 한마디 흘립니다.]`,
    "(조용함)",
    "",
    `${label}에 대해 가볍게 한 줄. 카탈로그 설명 톤 X. 그냥 눈에 들어와서 한마디.`,
    "- 관찰 ('___ 색이 좀 바랬네')",
    "- 행동 의향 ('잠깐 ___ 앞에 앉아 있다 갈게')",
    "- 추억/연상 ('___ 보니까 옛날 ___ 생각나')",
    '- 구성: "(짧은 반응) + 이야기 한 가지"까지만. 두 번째 화제·이야기 X.',
    "- 정확히 1~2문장. 각 문장은 반드시 마침표/물음표/느낌표로 닫고 끝내.",
    "- 광고·요약·안내 톤 X. 카탈로그 같은 묘사 X.",
  ].join("\n");
  const system = `너는 ${member.name}. ${member.persona?.affinity?.join(", ") ?? ""}. ${member.backstory ?? ""}`;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
      temperature: 1.0, max_tokens: 80,
    }),
  });
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content?.trim();
  console.log(`[${label}] → ${text}`);
}
process.exit(0);
