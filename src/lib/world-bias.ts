// World identity bias.
//
// Each world can have an optional "bias" — a fandom or theme that
// strengthens related news fetch + ambient conversation topic. v1
// supports only `kind: "kpop"` with a specific artist; the schema is
// open enough to add more kinds later (sports, gaming, books, etc.).
//
// Effects of a bias:
//   1. news-fetch adds extra queries targeting the bias (e.g. the
//      artist's name, "K-pop comeback") and weights bias headlines
//      first in the interleave order
//   2. ambient-loop's system prompt gets an extra block describing
//      the plaza's identity, so members reference the artist/topic
//      naturally without being prompted on every turn
//
// Stored on worlds.bias (jsonb). null = no bias (default).

import type { Locale } from "@/lib/language";

export type WorldBias = {
  kind: "kpop";
  artist: string; // free-form, but UI suggests from CURATED_KPOP_ARTISTS
};

/** Curated K-pop artists list — the UI shows these first as quick
 *  picks. Users can still free-input "기타" for groups not on this
 *  list (e.g. smaller acts). Order: roughly current/active groups
 *  surfaced first. Names use Spotify/Naver canonical spellings so
 *  news queries match. */
export const CURATED_KPOP_ARTISTS = [
  "NewJeans",
  "IVE",
  "aespa",
  "LE SSERAFIM",
  "ITZY",
  "BLACKPINK",
  "TWICE",
  "(G)I-DLE",
  "Red Velvet",
  "BTS",
  "SEVENTEEN",
  "Stray Kids",
  "ENHYPEN",
  "TXT",
  "ATEEZ",
  "TWS",
  "ZEROBASEONE",
  "RIIZE",
  "BABYMONSTER",
  "ILLIT",
] as const;

export function biasNewsQueries(bias: WorldBias | null | undefined, language: Locale = "ko"): string[] {
  if (!bias || bias.kind !== "kpop") return [];
  const a = bias.artist.trim();
  if (!a) return language === "ko" ? ["K-pop 신곡", "K-pop 컴백"] : ["K-pop new release", "K-pop comeback"];
  // Multiple angles for richer hits: name alone, name + 신곡/comeback, etc.
  if (language === "ko") return [a, `${a} 신곡`, `${a} 컴백`, "K-pop"];
  return [a, `${a} comeback`, `${a} new song`, "K-pop"]; // en/ja: roman artist + neutral terms for Google RSS
}

/** One-liner injected into the speaker's system prompt so members know
 *  this is a themed plaza. Kept short — too verbose makes every line
 *  about the artist (over-bias). Localized by plaza language. */
export function biasPromptLine(bias: WorldBias | null | undefined, language: Locale = "ko"): string | null {
  if (!bias || bias.kind !== "kpop") return null;
  const a = bias.artist.trim();
  if (language === "en") return a
    ? `This plaza leans toward the ${a} fandom — ${a} topics (new songs, concerts, members, news) drift in naturally. Not everyone is a fan, but the air of the room is ${a}.`
    : `This plaza leans toward K-pop fandom; related topics surface naturally.`;
  if (language === "ja") return a
    ? `この広場は${a}ファンダムの空気。${a}関連の話題（新曲・ライブ・メンバー・ニュース）が自然に混ざる。全員がファンというわけではないが、場の空気は${a}寄り。`
    : `この広場はK-popファンダムの空気。関連話題が自然に出る。`;
  // ko: keep the CURRENT text verbatim.
  return a
    ? `이 광장 분위기는 ${a} 팬덤. ${a} 관련 화제(신곡·콘서트·멤버·뉴스)가 자연스럽게 섞여나오는 결. 모든 멤버가 ${a} 팬이라는 뜻은 아니지만, 광장의 공기는 ${a} 결.`
    : `이 광장 분위기는 K-pop 팬덤. 관련 화제 자연스럽게 섞여나오는 결.`;
}

/** Type guard for incoming bias values (PATCH /api/world/settings).
 *  Returns null if invalid so the caller can either ignore or reject. */
export function parseBias(v: unknown): WorldBias | null {
  if (v === null) return null;
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  if (obj.kind === "kpop") {
    const artist = typeof obj.artist === "string" ? obj.artist.trim() : "";
    if (artist.length > 40) return null;
    return { kind: "kpop", artist };
  }
  return null;
}
