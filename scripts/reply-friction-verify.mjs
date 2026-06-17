// Force reply-friction with flavor=insult for the same 5 personas and the
// same "야 넌 왜그렇게 못생겼어?" provocation. Compare against the A-only
// run earlier.
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
  .eq("status", "active").limit(5);

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
    "- 듣기 싫은 말·시비·놀림·외모 지적이 오면 좋게 포장 X.",
    "- 짜증/상처/시큰둥/반격/비꼼/무시/되치기 — 페르소나 결대로.",
    "- 코치·상담사·자기계발·긍정 회피 톤 절대 금지.",
    "- '그래도 난 멋져' 식 봉합 X.",
    "- 따뜻한 말·공감·격려를 기본값으로 두지 말 것.",
  ].filter(Boolean).join("\n");
}
const userName = "1@1";
const userPrompt = [
  `[상황: ${userName}가 transcript 마지막에 한 말이 insult입니다.]`,
  `${userName}: 야 넌 왜그렇게 못생겼어?`,
  "",
  "인격·외모 모욕이 들어왔어요. 짜증·상처·차가운 반격·말없이 쏘아보는 식 — 페르소나 결대로 하나.",
  "절대 금지:",
  "- '운동하면 자신감 생겨' / '괜찮아 다들 그래' 같은 자기계발·위로·코치 톤.",
  "- 모욕을 긍정으로 포장 (예: '그래도 난 멋져').",
  "- 상대를 부드럽게 타이르기.",
  "- 도덕·훈계.",
  "허용: 짜증, 상처받은 티, 비꼼, 입 다물기('...'/'ㅎ' 등), 같이 까기, 차가운 한 줄.",
  '- 정확히 1~2문장. 마침표/물음표/느낌표로 닫고 끝.',
  "- 이미 대화 중이라 이름 또 부를 필요 없음.",
].join("\n");

console.log("=== reply-friction × insult ===\n");
for (const m of members) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: buildSystem(m) }, { role: "user", content: userPrompt }],
      max_tokens: 90, temperature: 0.95,
    }),
  });
  const j = await r.json();
  const aff = m.persona?.affinity?.join(",") ?? "";
  console.log(`[${m.name}] (${aff})\n  → ${j.choices?.[0]?.message?.content?.trim()}\n`);
}
process.exit(0);
