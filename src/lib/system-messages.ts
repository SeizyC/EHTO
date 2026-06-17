// Localized builders for templated plaza LIFECYCLE messages.
//
// These are the owner-less "system" notices (and the member parting
// lines) that the world tick inserts into the `messages` table. They are
// NOT AI-generated chat and NOT UI strings — they are fixed templates, so
// a non-Korean plaza must render them in the plaza's own language rather
// than leaking Korean.
//
// CRITICAL: the `ko` branch of every builder returns the EXACT string the
// source inserted before this module existed, so Korean plazas keep
// byte-identical lifecycle text. Do NOT paraphrase the `ko` strings.

import type { Locale } from "@/lib/language";

/** Arrival system notice — kind:"system", owner-less.
 *  Source (verbatim ko): world-seed.ts `${m.name} 님이 입장하셨어요`. */
export function sysMemberJoined(language: Locale, name: string): string {
  if (language === "en") return `${name} just arrived`;
  if (language === "ja") return `${name} さんが入ってきた`;
  return `${name} 님이 입장하셨어요`;
}

/** Member parting lines (spoken as the departing member, kind:"chat").
 *  The ko array is a verbatim copy of rotation.ts PARTING_LINES; the
 *  en/ja arrays are native equivalents in the same casual register. */
const PARTING_LINES: Record<Locale, readonly string[]> = {
  ko: [
    "오늘은 갈게",
    "잠깐 나갔다 올게",
    "이만 가본다",
    "다음에 또 봐",
    "잘 자",
    "갔다 올게 ㅎ",
    "조심히들",
    "또 들를게",
  ],
  en: [
    "heading out for today",
    "stepping out for a bit",
    "alright, i'm off",
    "catch you next time",
    "night",
    "gonna head out lol",
    "take care everyone",
    "i'll drop by again",
  ],
  ja: [
    "今日はもう行くね",
    "ちょっと出てくる",
    "そろそろ行くわ",
    "また今度ね",
    "おやすみ",
    "もう行くね笑",
    "みんな気をつけて",
    "また来るね",
  ],
};

/** Pick a random localized parting line for the plaza language.
 *  Falls back to ko if the locale is somehow absent. */
export function sysMemberLeft(language: Locale): string {
  const lines = PARTING_LINES[language] ?? PARTING_LINES.ko;
  return lines[Math.floor(Math.random() * lines.length)];
}
