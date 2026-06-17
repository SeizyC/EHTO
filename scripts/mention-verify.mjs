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
    "톤 규칙: 한국어 친구 톤. 짧게(1-2문장).",
    "",
    "인간 반응 규칙 (중요):",
    "적대적·시비·놀림·외모지적 입력에 대해서만:",
    "- 좋게 포장 X. 짜증/상처/시큰둥/반격 — 페르소나 결대로.",
    "- 코치·자기계발 톤 금지.",
    "",
    "평범한 입력(인사·호기심·잡담·질문)에 대해서는:",
    "- 사람답게 따뜻하거나 가볍거나 살짝 재치 있게. 차갑게 굴 필요 없음.",
    "- 질문은 진지하게 답함. 회피·무시·premise 부정 금지.",
  ].filter(Boolean).join("\n");
}

const provocations = [
  "넌 이방에 언제 왔어?",
  "오늘 뭐했어?",
  "취미가 뭐야?",
];
const userName = "1@1";

for (const q of provocations) {
  console.log(`\n=== "@member ${q}" ===`);
  for (const m of members) {
    const userPrompt = [
      `[상황: ${userName}가 당신 이름을 부르며 말을 걸었어요. 직접 응답해야 합니다.]`,
      `${userName}: @${m.name} ${q}`,
      "",
      `당신(${m.name})에게 건넨 말이에요. 페르소나 결대로 자연스럽게 답하세요.`,
      "필수:",
      "- 질문이면 **반드시 질문에 답부터 함**. 정확히 모르면 두루뭉술 OK ('아 잘 모르겠는데', '한 일주일?', '글쎄').",
      "- 답한 다음 짧은 되묻기/드립/감탄 하나만 덧붙여도 좋음.",
      "- 살짝 재치 있게.",
      "금지:",
      "- 질문 자체를 부정·무시·회피 ('그건 신경 안 써도 돼', '왜 그게 궁금한데', '무의미해' 류).",
      "- 질문과 무관한 자기 일화 갑자기 끼워넣기.",
      "- '방장' 호칭.",
      "- 정확히 1~2문장. 마침표/물음표/느낌표로 닫고 끝.",
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
