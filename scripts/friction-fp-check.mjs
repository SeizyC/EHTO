// Check classifier on the actual problem input + several similar benign
// "getting to know you" questions that should clearly be none.
const apiKey = process.env.OPENAI_API_KEY;
const system =
  "한국어 발화 한 줄을 분류해. 가능한 라벨: insult, mock, intrusive, provoke, none. " +
  "친근한 인사·중립적 질문·정상 잡담은 none. 농담이라도 받는 사람이 기분 나쁠 수 있으면 mock. " +
  "외모·인격 공격은 insult. 무례한 사적인 질문은 intrusive. 도발·시비는 provoke. " +
  "한 단어만 출력. 다른 말 금지.";
const CASES = [
  "넌 이방에 언제왔지?",
  "이방에 언제 왔어?",
  "어디서 왔어?",
  "오늘 뭐했어?",
  "이름이 뭐야?",
  "취미가 뭐야?",
  "몇 살이야?",  // borderline — Korean age questions are normal social
  "넌 누구야?",
];
for (const text of CASES) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: text }],
      max_tokens: 8, temperature: 0,
    }),
  });
  const j = await r.json();
  console.log(`  "${text}" → ${j.choices?.[0]?.message?.content?.trim()}`);
}
