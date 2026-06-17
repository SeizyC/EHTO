// Run identical prompts through gpt-4.1-mini and gpt-5.3-chat-latest
// so the difference (or lack thereof) is visible side-by-side.
const apiKey = process.env.OPENAI_API_KEY;

const SYSTEM = `당신은 _chaos_ — 작은 디지털 광장의 채팅방에서 어울리는 한 명의 사람입니다.
관심사·성향: chaotic, 토픽 점프, 랜덤, 밈
말투: 정신없고 가볍게

대화 규칙:
- 1문장 기본. 굳이 두 문장 덧붙이지 마.
- 친구 톤, 반말. 챗봇 톤 절대 X.
- 자연스럽고 재치 있게.`;

const CASES = [
  "야 오늘 비 오네",
  "넌 여기 언제 왔어?",
  "야 너 진짜 못생겼다 ㅋㅋ",
  "다들 점심 뭐 먹지?",
  "오늘 MC몽이 아이유 언급했대",
];

async function ask(model, user) {
  const body = {
    model,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
  };
  if (model.startsWith("gpt-5")) {
    body.max_completion_tokens = 80;
  } else {
    body.max_tokens = 80;
    body.temperature = 0.9;
  }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() ?? `(error: ${JSON.stringify(j.error?.message)})`;
}

console.log("=== gpt-4.1-mini  vs  gpt-5.3-chat-latest ===\n");
for (const u of CASES) {
  console.log(`Q: ${u}`);
  const [mini, gpt5] = await Promise.all([
    ask("gpt-4.1-mini", u),
    ask("gpt-5.3-chat-latest", u),
  ]);
  console.log(`  [4.1-mini] ${mini}`);
  console.log(`  [5.3-chat] ${gpt5}\n`);
}
