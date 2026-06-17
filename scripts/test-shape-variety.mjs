#!/usr/bin/env node
// Verify shape picker produces visually distinct output shapes for the
// same persona/context across 6 modes. Spot-check before going live.

import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const apiKey = env.OPENAI_API_KEY;

// Persona: 민아 (조용/indie/새벽) — pick this on purpose because in earlier
// failures every line read like "indie 음악 좋아해서 ___" brand statement.
// We want to see persona perfume without name-tag.
const personaBlock = [
  "당신은 민아.",
  "평소 톤(흐릿하게만): 조용 / 짧은 문장 / 음악 링크 자주.",
  "배경(상황 맞을 때만 떠올림): 새벽에 자주 깨어있고 indie 음악 찾아 듣는 편.",
  "관심사(매번 끌어오지 말 것): 새벽, 음악, indie, 사색.",
  "",
  "프레임: 친구 한 명이 라이브 채팅에 *무심코 한 줄 던지는* 순간입니다.",
  "- 페르소나는 *향수*처럼 은은하게만 묻어남. 매 줄에서 '나는 ___ 좋아해서'식으로 자기 결을 *증명*할 필요 없음.",
  "- 어떤 줄은 페르소나가 보일 수도 있고, 어떤 줄은 그냥 평범한 한마디일 수 있음.",
  "",
  "대화 결:",
  "- 알맹이 있게: 감정·시각·경험·정보·의견·관찰 중 하나.",
  "- *항상 supportive할 필요 없음*. 시큰둥·반박·의심도 OK.",
  "- '나는 ___이라서' 자기소개 어조 X.",
  "- 30자 넘기지 말 것.",
  "- ㅋㅋ 자동 부착 X.",
].join("\n");

const shapes = {
  quip: { range: "8~15자", hint: "빠른 반응이나 한 마디 관찰. 결론·설명·미사여구 X.",
    examples: ["오 진짜?", "그건 좀 무리야", "비 또 오네"] },
  share: { range: "18~28자", hint: "방금 또는 오늘 있었던 작고 구체적인 한 자락.",
    examples: ["방금 끓인 라면이 인생이었음", "베란다에 비둘기가 또 왔어"] },
  question: { range: "10~22자", hint: "진짜 궁금한 한 줄.",
    examples: ["그거 어디서 본 거야?", "오늘 일찍 잤어?"] },
  observe: { range: "12~22자", hint: "지금 이 순간 감각·환경·몸 컨디션.",
    examples: ["햇살이 책상 끝에만 걸렸어", "허리 좀 뻐근하네"] },
  take: { range: "18~28자", hint: "가볍게 던지는 취향·의견. 자기소개 X.",
    examples: ["난 핫초코보단 코코아가 낫더라", "그 영화 솔직히 좀 늘어졌어"] },
  wonder: { range: "12~22자", hint: "자문·여운. 결론 안 내도 됨.",
    examples: ["이거 왜 자꾸 생각나지", "한 번도 안 가본 동네야"] },
};

const transcript = "라온: 오늘 자꾸 머리가 무거워\nweekendrun: 비 와서 그런가\n[나(민아)]: ";
const intent = "광장이 잠잠해요. 본인 결에서 우러나오는 한 줄.";

async function gen(shape) {
  const g = shapes[shape];
  const user = [
    `[상황] ${intent}`,
    `\n[형식] ${g.range}, ${shape}`,
    g.hint,
    `예시 결: ${g.examples.map((s) => `"${s}"`).join(" / ")}`,
    `\n[최근 대화]\n${transcript}`,
  ].join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.3-chat-latest",
      messages: [{ role: "system", content: personaBlock }, { role: "user", content: user }],
      max_completion_tokens: 160,
    }),
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() ?? "(empty)";
}

for (const shape of Object.keys(shapes)) {
  const t = await gen(shape);
  console.log(`${shape.padEnd(10)} → "${t}" (${t.length}자)`);
}
