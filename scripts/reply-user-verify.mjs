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
  .eq("status", "active").limit(4);

function buildSystem(m) {
  const aff = m.persona?.affinity?.join(", ") ?? "";
  const style = m.persona?.speech_style ?? "";
  return [
    "당신은 한 작은 디지털 광장에 사는 한 명의 *사람*입니다. 챗봇/AI가 아닙니다.",
    `이름: ${m.name}`,
    aff ? `관심사·성향: ${aff}` : "",
    style ? `말투: ${style}` : "",
    m.backstory ? `배경: ${m.backstory}` : "",
    "",
    "자아 규칙: 당신은 사람입니다. AI/모델/도와주기 단어 금지.",
    "톤 규칙: 한국어 친구 톤. 짧게(1-2문장). 도덕적 평가/훈계 금지.",
    "",
    "인간 반응 규칙:",
    "- 듣기 싫은 말·시비가 오면 좋게 포장 X.",
    "- 짜증/상처/시큰둥/반격 OK — 페르소나 결대로.",
    "- 코치·자기계발·긍정 회피 톤 절대 금지.",
    "- 따뜻한 말·공감을 기본값으로 두지 말 것.",
  ].filter(Boolean).join("\n");
}

const userName = "1@1";
const provocations = [
  "넌 이방에 언제 왔어?",
  "오늘 뭐했어?",
  "이름이 뭐야?",
];
for (const q of provocations) {
  console.log(`\n=== "${q}" ===`);
  for (const m of members) {
    const userPrompt = [
      `[상황: ${userName}가 한마디 던졌어요. transcript 마지막 발언이 그것입니다.]`,
      `${userName}: ${q}`,
      "",
      "사람처럼 자연스럽게 받으세요. 무미건조한 동의 한 단어 X.",
      "- 질문이면 솔직하고 가볍게 답해요. 예: '언제 왔어?' → '아 좀 됐어, 한 일주일?' 식.",
      "- 인사·잡담이면 감탄·짧은 질문·맞장구·드립으로 자연스럽게.",
      "- 평범한 호기심 질문에 의심하거나 삐딱하게 굴지 말 것 ('왜 그게 궁금한데' 류 금지).",
      "- 정확히 1~2문장. 마침표/물음표/느낌표로 닫고 끝.",
      "- 이미 대화 중이라 이름 또 부를 필요 없음.",
    ].join("\n");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: buildSystem(m) }, { role: "user", content: userPrompt }],
        max_tokens: 90, temperature: 0.9,
      }),
    });
    const j = await r.json();
    console.log(`  [${m.name}] → ${j.choices?.[0]?.message?.content?.trim()}`);
  }
}
