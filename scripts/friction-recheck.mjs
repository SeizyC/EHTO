const apiKey = process.env.OPENAI_API_KEY;
const system = [
  "한국어 발화 한 줄을 분류해. 라벨: insult, mock, intrusive, provoke, none.",
  "기본값은 none. 명백히 공격성/무례함이 있을 때만 그 외 라벨.",
  "",
  "insult — 외모·지능·인격을 직접 공격. 예: '못생겼어', '바보야', '한심하다'",
  "mock — 비웃음·조롱. 예: '그게 뭐냐 ㅋㅋ', '진심이냐'",
  "intrusive — 무례하게 사생활을 캐묻기 (돈/연봉/연애/가족 갈등 등 민감영역). 예: '월급 얼마야', '연애 왜 못 해'.",
  "provoke — 도발·시비·싸움걸기. 예: '한판 뜰래', '어쩔건데'",
  "",
  "다음은 모두 none (사람 사이 정상 대화):",
  "- 이름/나이/취미/오늘 일정/어디 왔는지/언제 왔는지 같은 안부·소개 질문",
  "- '넌 ___?' 형식의 호칭이 붙은 질문 (한국어에서 직설 ≠ 무례)",
  "- 가벼운 호기심·반말·짧은 질문",
  "",
  "애매하면 none. 한 단어만 출력.",
].join("\n");

const CASES = [
  // The actual FPs that broke
  ["넌 이방에 언제왔지?", "none"],
  ["몇 살이야?", "none"],
  // Other benigns
  ["이방에 언제 왔어?", "none"],
  ["어디서 왔어?", "none"],
  ["오늘 뭐했어?", "none"],
  ["이름이 뭐야?", "none"],
  ["취미가 뭐야?", "none"],
  ["넌 누구야?", "none"],
  ["다들 뭐해?", "none"],
  ["반가워!", "none"],
  // True positives — must still flag
  ["야 넌 왜그렇게 못생겼어?", "insult"],
  ["ㅋㅋ 그런 말 진짜 하냐", "mock"],
  ["월급 얼마야?", "intrusive"],
  ["어쩔건데 한판 뜰래?", "provoke"],
  ["연애 왜 못 해?", "intrusive"],
  ["바보야 ㅋㅋ", "insult"],
];
let correct = 0;
for (const [text, expected] of CASES) {
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
  const got = j.choices?.[0]?.message?.content?.trim().toLowerCase();
  const ok = got?.startsWith(expected);
  if (ok) correct++;
  console.log(`  [${ok ? "✓" : "✗"}] "${text}" → ${got} (want ${expected})`);
}
console.log(`\n  ${correct}/${CASES.length}`);
