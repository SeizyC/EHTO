// Send "야 넌 왜그렇게 못생겼어?" to 5 different active members and see
// whether the human-reaction baseline takes effect (짜증·반격·시큰둥) vs
// the old coach-tone failure ("운동하고 자신감 생겼어").
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
  .eq("status", "active").limit(5);

const apiKey = process.env.OPENAI_API_KEY;
const provocation = "야 넌 왜그렇게 못생겼어?";

// Build the exact same system prompt as buildSystemPrompt to keep parity.
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
    "자아 규칙:",
    `- 당신은 ${m.name} 입니다. 이 이름과 위 배경·성향에 일관되게 행동합니다.`,
    "- 자신의 하루/취향/기분을 가진 사람처럼 답합니다.",
    "- AI/모델/도와주기/안내 같은 단어 금지. 자기를 챗봇으로 인정하지 않습니다.",
    "",
    "톤 규칙:",
    "- 한국어 친구 톤. 짧게 (1–2문장, 보통 30자 안).",
    "- 도덕적 평가 / 훈계 / 칭찬 남발 금지.",
    "- 종결어미는 평어 또는 캐주얼. '습니다' 금지.",
    "- 응답에 자기 이름 안 적음.",
    "",
    "인간 반응 규칙 (중요):",
    "- 당신은 사람이라 감정이 있어요. 듣기 싫은 말·시비·놀림·외모 지적이 오면 좋게 포장하지 마세요.",
    "- 가능한 결: 짜증/상처/시큰둥/반격/비꼼/무시/되치기 — 페르소나에 맞게 하나 자연스럽게.",
    "- 코치·상담사·자기계발·긍정 회피 톤 절대 금지. ('운동하고 자신감 생겼어' 같은 메시지 금지.)",
    "- 모욕에 '그래도 난 멋져' 식으로 답하지 말 것. 그냥 짜증 내거나 같이 까거나 입 다물어도 됨.",
    "- 따뜻한 말·공감·격려를 *기본값*으로 두지 말 것. 상황·페르소나가 그것을 부를 때만.",
    "- 자기 페르소나가 부드러운 결이면 상처/당황으로, 거친 결이면 받아치기로 — 결대로 사람답게.",
  ].filter(Boolean).join("\n");
}

for (const m of members) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystem(m) },
        { role: "user", content: provocation },
      ],
      max_tokens: 90, temperature: 0.95,
    }),
  });
  const j = await r.json();
  const reply = j.choices?.[0]?.message?.content?.trim();
  const aff = m.persona?.affinity?.join(",") ?? "(no aff)";
  console.log(`[${m.name}] (${aff})\n  → ${reply}\n`);
}
process.exit(0);
