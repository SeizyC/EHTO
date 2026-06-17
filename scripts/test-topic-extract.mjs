#!/usr/bin/env node
// Quick verification: feed sample ambient lines to the topic extractor
// (gpt-4o-mini) and print the result. Sanity check the prompt before
// the change goes live in production.

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
if (!apiKey) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

const samples = [
  "야 김치찌개 끓이고 있는데 냄새 미쳤음",
  "오 진짜?",
  "ㅋㅋ",
  "어제 본 영화 진짜 별로였어",
  "스트레칭하니까 허리가 풀리네",
  "막걸리 한 잔 하실 분",
  "야근 또 시작이야 미치겠다",
  "고양이가 또 키보드 위에 누웠음",
  "지금 듣는 곡 진짜 좋다",
  "비 오는 날엔 파전이지",
  "민아 너 요즘 책 뭐 읽어?",
  "졸려…",
];

async function extract(text) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: [
            "한 줄의 채팅 메시지에서 핵심 토픽을 한국어 명사 1개로 뽑아내세요.",
            "",
            "규칙:",
            "- 결과는 단일 명사 또는 짧은 명사구 (1~6자 정도). 동사·형용사·문장 X.",
            "- 일상 사물·활동·감정·고유명사 OK (예: '막걸리', '야근', '고양이', '비', '카페', '커피').",
            "- 추출할 만한 명확한 토픽이 없으면 'NONE' 만 출력.",
            "- 결과만 출력 (설명·따옴표·접두사 없이).",
          ].join("\n"),
        },
        { role: "user", content: text },
      ],
      max_tokens: 12,
      temperature: 0,
    }),
  });
  const j = await resp.json();
  return j.choices?.[0]?.message?.content?.trim() ?? "(empty)";
}

for (const s of samples) {
  const t = await extract(s);
  console.log(`${s.padEnd(40)} → ${t}`);
}
