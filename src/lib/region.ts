// Region = the cultural LIFE-CONTEXT of a plaza's friends (KR/US/JP/GLOBAL),
// kept independent of the plaza LANGUAGE. Estimated from the owner's browser
// timezone at world creation; the owner can change it later.

import type { MemberRegion } from "@/lib/member-templates";

/** Best-effort region guess from an IANA timezone. Unknown → GLOBAL. */
export function regionFromTimezone(tz?: string | null): MemberRegion {
  if (!tz) return "KR"; // no signal → preserve the default KR path
  const z = tz.trim();
  if (z === "Asia/Seoul") return "KR";
  if (z === "Asia/Tokyo" || z === "Asia/Osaka") return "JP";
  if (z.startsWith("America/") || z === "US" || z.startsWith("US/")) return "US";
  if (z.startsWith("Canada/")) return "US"; // North-American life-context bucket
  // Everything else (Europe, Oceania, other Asia, Africa…) → GLOBAL mix.
  return "GLOBAL";
}

/** Human label for the region's everyday setting — used in prompt context. */
export const REGION_SETTING: Record<MemberRegion, { ko: string; en: string; ja: string }> = {
  KR: {
    ko: "한국(서울·수도권) 생활권 — 편의점, 배달앱, 지하철, 야근, 카페, 노래방이 일상.",
    en: "everyday life in Korea (Seoul area) — convenience stores, delivery apps, the subway, overtime, cafes.",
    ja: "韓国(ソウル圏)の生活圏 — コンビニ、デリバリー、地下鉄、残業、カフェが日常。",
  },
  US: {
    ko: "미국 도시/교외 생활권 — bodega, Target, Trader Joe's, commute, rent, diner, food truck이 일상.",
    en: "everyday US city/suburb life — the bodega, Target, Trader Joe's, the commute, rent, diners, food trucks.",
    ja: "アメリカの都市/郊外の生活 — bodega、Target、Trader Joe's、通勤、家賃、diner が日常。",
  },
  JP: {
    ko: "일본(도쿄·오사카·지방도시) 생활권 — コンビニ, 駅前, 居酒屋, 終電, 会社帰り, スーパー가 일상.",
    en: "everyday life in Japan (Tokyo/Osaka) — コンビニ, the station area, 居酒屋, the last train, スーパー.",
    ja: "日本(東京・大阪・地方)の生活圏 — コンビニ、駅前、居酒屋、終電、会社帰り、スーパーが日常。",
  },
  GLOBAL: {
    ko: "이주자·외국인·디지털노마드 — 어느 한 도시에 매이지 않은 생활, 시차와 이동이 일상.",
    en: "a migrant/expat/nomad life — not tied to one city, timezones and moving around are everyday.",
    ja: "移住者・外国人・ノマドの生活 — 一つの都市に縛られず、時差や移動が日常。",
  },
};
