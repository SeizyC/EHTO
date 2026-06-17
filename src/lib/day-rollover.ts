// "오늘"의 경계는 한국 시간 오전 9시. 그 전(=오전 9시 미만)이면 전날 9시
// 부터를 오늘로 본다. 즉 "하루"는 09:00 KST → 다음날 08:59:59 KST.

const KST_OFFSET_MS = 9 * 3600_000;
const ROLLOVER_HOUR = 9;

/** Returns the start-of-"day" (oldest message included) for the day that
 *  contains `nowMs`. KST 09:00 rollover. */
export function dayStart(nowMs: number = Date.now()): Date {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  const kstYear = kst.getUTCFullYear();
  const kstMonth = kst.getUTCMonth();
  const kstDate = kst.getUTCDate();
  const kstHour = kst.getUTCHours();

  // Today's 09:00 KST as UTC ms
  const todayNine = Date.UTC(kstYear, kstMonth, kstDate, ROLLOVER_HOUR, 0, 0) - KST_OFFSET_MS;
  // If now is before today's 9 AM KST, "today" started yesterday at 9 AM KST.
  return new Date(kstHour < ROLLOVER_HOUR ? todayNine - 24 * 3600_000 : todayNine);
}

/** Start of a specific day given a YYYY-MM-DD string (KST date label). */
export function dayStartFromLabel(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  // 09:00 KST of that calendar date
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, ROLLOVER_HOUR, 0, 0) - KST_OFFSET_MS);
}

/** Returns the YYYY-MM-DD label for the day that contains `ms`. The label
 *  is the date of the *starting* calendar day in KST (since the day spans
 *  09:00 → next-day 08:59). */
export function dayLabel(ms: number): string {
  const start = dayStart(ms);
  const kst = new Date(start.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** End of day (exclusive upper bound) given the day-start. */
export function dayEnd(start: Date): Date {
  return new Date(start.getTime() + 24 * 3600_000);
}
