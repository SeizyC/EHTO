// 한국 시간(KST, Asia/Seoul) 기반 시간대 bucket.
// 각 bucket = 광장 배경 이미지 1장.
// 새벽 (5–7) → dawn
// 아침 (7–11) → morning
// 오후 (11–17) → afternoon
// 저녁 (17–20) → evening
// 밤 (20–5) → night

export type TimeBucket = "dawn" | "morning" | "afternoon" | "evening" | "night";

export type BucketInfo = {
  id: TimeBucket;
  label: string;     // 한국어 부드러운 표현 (Atmosphere Header용)
  hourStart: number; // 0–23, KST
};

// Order matters: walked in order to find current bucket.
const BUCKETS: BucketInfo[] = [
  { id: "dawn",      label: "푸르스름한 새벽", hourStart: 5  },
  { id: "morning",   label: "맑은 아침",      hourStart: 7  },
  { id: "afternoon", label: "잔잔한 오후",    hourStart: 11 },
  { id: "evening",   label: "노을 지는 저녁", hourStart: 17 },
  { id: "night",     label: "고요한 밤",      hourStart: 20 },
];

// Get hour in Asia/Seoul timezone regardless of viewer's local tz.
function kstHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value;
  return h === "24" ? 0 : Number(h);
}

// Natural current-time phrase in the plaza language, so chat can be
// time-appropriate ("새벽 3시쯤" → no "밥 먹었어?"). KST-based like everything
// else here. Computed server-side per generation so it's always current.
export function kstTimeLabel(language: "ko" | "en" | "ja" = "ko", now: Date = new Date()): string {
  const h = kstHour(now);
  const h12 = ((h + 11) % 12) + 1;
  if (language === "en") {
    const period = h < 5 ? "late night" : h < 7 ? "early morning" : h < 11 ? "morning" : h < 17 ? "afternoon" : h < 20 ? "evening" : "night";
    return `${period}, around ${h12}${h < 12 ? "am" : "pm"} KST`;
  }
  if (language === "ja") {
    const period = h < 5 ? "深夜" : h < 7 ? "早朝" : h < 11 ? "朝" : h < 17 ? "昼" : h < 20 ? "夕方" : "夜";
    return `${period}${h}時ごろ`;
  }
  const period = h < 5 ? "새벽" : h < 7 ? "이른 아침" : h < 11 ? "아침" : h < 17 ? "낮" : h < 20 ? "저녁" : "밤";
  return `${period} ${h12}시쯤`;
}

export function currentBucket(now: Date = new Date()): BucketInfo {
  const h = kstHour(now);
  // Night wraps midnight: 20 → next day 5
  if (h >= 20 || h < 5) return BUCKETS[4]; // night
  // Walk forward to find the latest bucket whose hourStart <= h
  let chosen: BucketInfo = BUCKETS[0];
  for (const b of BUCKETS) {
    if (h >= b.hourStart) chosen = b;
  }
  return chosen;
}

export function plazaImagePath(bucket: TimeBucket): string {
  return `/sprites/rooms/plaza_${bucket}.png`;
}

// Director scene-of-day. Maps each KST time bucket to (1) a one-line vibe
// hint injected into the speech prompt so persona-share / new-topic lines
// drift toward bucket-appropriate flavor, and (2) intent bias deltas
// nudging the ambient picker toward bucket-appropriate intents. The hint
// is intentionally a vibe sketch — NOT a topic mandate — so personas
// still drive content; we just bend the average.
export type SceneOfDay = {
  /** Single-line vibe sketch shown to the speaker model. */
  hint: string;
  /** Multiplicative weight tweaks on the picker's quiet-moment intents.
   *  Missing keys = no change (1.0). */
  bias: Partial<Record<
    "new-topic" | "persona-share" | "mood" | "object-interaction",
    number
  >>;
};

// Scene hints are *vibe sketches*, not topic mandates and NOT tone/
// length mandates. Earlier drafts said "차분히 짧게" / "야근 푸념" — the
// model dutifully made every member sound the same tired-night voice.
// Now: background atmosphere only. Members ride their own personas
// inside it.
export const SCENE_BY_BUCKET: Record<TimeBucket, SceneOfDay> = {
  dawn: {
    hint: "푸르스름한 새벽 시간대. (배경 정보일 뿐 — 자기 페르소나가 새벽에 맞는 결이면 자연스럽게, 아니어도 무리해서 새벽 감성 만들 필요 없음)",
    bias: { mood: 1.3, "persona-share": 1.0, "new-topic": 0.9 },
  },
  morning: {
    hint: "아침 시간대. 사람들이 막 하루를 시작하는 무렵.",
    bias: { "new-topic": 1.2, "persona-share": 1.1 },
  },
  afternoon: {
    hint: "오후 시간대. 일과 한가운데.",
    bias: { "persona-share": 1.2, "new-topic": 1.1 },
  },
  evening: {
    hint: "저녁 시간대. 일이 끝나가는 무렵.",
    bias: { "persona-share": 1.2, mood: 1.05 },
  },
  night: {
    hint: "밤 시간대. (배경 정보일 뿐 — 모든 멤버가 자동으로 '졸려', '잠 안 와' 같은 결로 말하면 안 됨. 자기 페르소나 결대로.)",
    bias: { mood: 1.2, "persona-share": 1.15, "new-topic": 0.85 },
  },
};

// Milliseconds until the next bucket change. Useful for scheduling a smooth
// crossfade at the boundary without polling.
export function msUntilNextBucket(now: Date = new Date()): number {
  const h = kstHour(now);
  const order = [5, 7, 11, 17, 20]; // next boundary hours
  const nextHour = order.find((x) => x > h) ?? 24 + 5; // wraps to next day 5am
  // Compute next boundary timestamp in KST
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const kstY = get("year");
  const kstM = get("month");
  let kstD = get("day");
  const kstMin = get("minute");
  const kstSec = get("second");
  let bh = nextHour;
  if (bh >= 24) { kstD += 1; bh -= 24; }
  // Approximate ms until: (boundary - current) in seconds
  const secondsUntil =
    (bh - h) * 3600 - kstMin * 60 - kstSec;
  // Handle day-wrap rough adjust (we treat KST math approximately)
  const ms = (secondsUntil <= 0 ? secondsUntil + 24 * 3600 : secondsUntil) * 1000;
  return Math.max(60_000, ms); // never less than 1 min
}
