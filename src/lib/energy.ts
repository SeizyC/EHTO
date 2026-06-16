// Daily life-energy accounting for a plaza's ambient "moments".
//
// A *moment* = one ambient generation (one Claude call → one member line).
// The billed quantity equals the cost unit, so capping moments caps cost
// directly (see docs/superpowers/specs/2026-06-14-monetization-design.md §6).
//
// Two independent daily counters live on `worlds`, both reset at KST midnight:
//   · moments  — AI↔AI ambient chatter (the cost governor)
//   · interject — replies to the owner's own messages (always-available reserve)
//
// This module is pure (no I/O) so it can be unit-tested via scripts/test-energy.ts.

export type Plan = "free" | "plus";
export type EnergyKind = "moment" | "interject";

// Starting hypotheses (spec §6). "plus" is a large finite number rather than
// Infinity so it serializes as JSON and compares with plain `<`.
// free 120 ≈ 60 min/day of viewing at the ~30s/line ambient cadence
// (120 lines × 30s = 3600s). Tuned with the engine's short-silence gate
// in ambient-loop.ts — change them together.
export const MOMENT_CAP: Record<Plan, number> = { free: 120, plus: 100_000 };
export const INTERJECT_CAP: Record<Plan, number> = { free: 15, plus: 100_000 };

export function planCap(plan: Plan, kind: EnergyKind): number {
  return kind === "moment" ? MOMENT_CAP[plan] : INTERJECT_CAP[plan];
}

// Max simultaneously-active residents per plaza, by plan. The hard product
// cap is 12 (the promoted promise — "최대 12명이 사는 작은 사회", spec §6.2);
// free sits at half so it feels alive yet leaves room to grow into Plus.
export const MEMBER_CAP: Record<Plan, number> = { free: 6, plus: 12 };
export function memberCap(plan: Plan): number {
  return MEMBER_CAP[plan];
}

/** KST calendar date "YYYY-MM-DD" (Asia/Seoul) — the daily-reset key. */
export function kstDayLabel(nowMs: number): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

export type Counter = { used: number; day: string | null };

/** If the stored day differs from today, zero the counter (daily refill). */
export function withDailyReset(c: Counter, todayLabel: string): Counter {
  return c.day === todayLabel ? c : { used: 0, day: todayLabel };
}

/** Remaining quota, never negative. */
export function remaining(used: number, cap: number): number {
  return Math.max(0, cap - used);
}

/** ms from now until the next KST midnight — drives the "자정에 충전" copy. */
export function msUntilKstMidnight(nowMs: number): number {
  const KST_OFFSET = 9 * 3600_000;
  const dayMs = 24 * 3600_000;
  const sinceMidnight = (((nowMs + KST_OFFSET) % dayMs) + dayMs) % dayMs;
  return dayMs - sinceMidnight;
}

export type EnergyView = {
  plan: Plan;
  used: number;
  cap: number;
  remaining: number;
  resetInMs: number;
};

/** Build the client-facing view of the *moment* budget (the meter shows this). */
export function energyView(plan: Plan, used: number, nowMs: number): EnergyView {
  const cap = MOMENT_CAP[plan];
  return { plan, used, cap, remaining: remaining(used, cap), resetInMs: msUntilKstMidnight(nowMs) };
}
