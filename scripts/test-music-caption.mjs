#!/usr/bin/env node
// Verify persona-voiced music captions across a few persona/track combos
// before we let it loose in production. Prints each (persona × track)
// pair's gpt-generated caption so we can eyeball that personas read
// distinctively rather than collapsing to one voice.

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

// Match member-templates.ts persona shapes
const personas = [
  { name: "민아", speech_style: "조용 / 짧은 문장 / 음악 링크 자주",
    affinity: ["새벽", "음악", "indie", "사색"] },
  { name: "weekendrun", speech_style: "활기 / 길어지면 본인 얘기",
    affinity: ["sports", "energy", "주말", "운동"] },
  { name: "_chaos_", speech_style: "갑자기 다른 얘기 / 링크 폭주",
    affinity: ["chaotic", "토픽 점프", "랜덤", "밈"] },
  { name: "심야서가", speech_style: "긴 문장 / 자기 안 얘기",
    affinity: ["우울", "사색", "독서", "심야"] },
];

const tracks = [
  { caption: "Space Song — Beach House",
    tags: ["lofi","chill","새벽","감성","indie"] },
  { caption: "Levitating — Dua Lipa",
    tags: ["energy","upbeat","주말","운동","sports","playful"] },
];

const slots = [
  { id: "morning", label: "아침" },
  { id: "evening", label: "저녁" },
];

async function caption(persona, track, slotLabel) {
  const body = {
    model: "gpt-5.3-chat-latest",
    messages: [
      {
        role: "system",
        content: [
          `당신은 ${persona.name}.`,
          `말투: ${persona.speech_style}`,
          `관심사: ${persona.affinity.join(", ")}`,
          "",
          `${slotLabel}에 음악 한 곡을 광장 채팅에 공유하려는 참입니다.`,
          "당신의 결로 *왜 이 곡을 듣는지·어떤 기분인지* 한 줄 자연스럽게 던지세요.",
          "",
          "규칙:",
          "- 한 줄, 12~25자. 한국어 캐주얼·반말.",
          "- 곡명은 출력에 *포함하지 마세요* (시스템이 따로 붙임).",
          "- '들어봐!', '추천!', 챗봇 어조 X. 페르소나가 친구한테 무심코 던지는 톤.",
          "- ㅋㅋ 자동 부착 X. 페르소나가 농담형이 아니면 안 씀.",
          "- 결과만 출력 (따옴표·접두사·곡명 없이).",
        ].join("\n"),
      },
      {
        role: "user",
        content: `[지금 듣는 곡] ${track.caption}\n[태그] ${track.tags.join(", ")}`,
      },
    ],
    max_completion_tokens: 240,
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() ?? "(empty)";
}

for (const p of personas) {
  for (const t of tracks) {
    for (const s of slots) {
      const c = await caption(p, t, s.label);
      console.log(`${p.name.padEnd(11)} | ${s.label} | ${t.caption.padEnd(30)} → ${c}`);
    }
  }
}
