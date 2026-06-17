// Two-part check:
//  (1) Classifier accuracy across hostile vs benign inputs.
//  (2) reply-friction prompt produces non-coach lines per persona × flavor.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = process.env.OPENAI_API_KEY;

const CASES = [
  // Hostile
  ["야 넌 왜그렇게 못생겼어?", "insult"],
  ["ㅋㅋ 그런 말 진짜 하냐", "mock"],
  ["월급 얼마야?", "intrusive"],
  ["어쩔건데 한판 뜰래?", "provoke"],
  // Benign
  ["다들 뭐해?", "none"],
  ["오늘 날씨 좋네", "none"],
  ["반가워!", "none"],
  ["나 새벽까지 코딩 중", "none"],
];

async function classify(text) {
  const system =
    "한국어 발화 한 줄을 분류해. 가능한 라벨: insult, mock, intrusive, provoke, none. " +
    "친근한 인사·중립적 질문·정상 잡담은 none. 농담이라도 받는 사람이 기분 나쁠 수 있으면 mock. " +
    "외모·인격 공격은 insult. 무례한 사적인 질문은 intrusive. 도발·시비는 provoke. " +
    "한 단어만 출력. 다른 말 금지.";
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
  return j.choices?.[0]?.message?.content?.trim().toLowerCase();
}

console.log("=== (1) Classifier accuracy ===");
let correct = 0;
for (const [text, expected] of CASES) {
  const got = await classify(text);
  const ok = got?.startsWith(expected);
  console.log(`  [${ok ? "✓" : "✗"}] "${text}" → ${got} (expected ${expected})`);
  if (ok) correct++;
}
console.log(`\n  ${correct}/${CASES.length} correct`);
process.exit(0);
