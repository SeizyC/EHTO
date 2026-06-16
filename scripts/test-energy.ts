import assert from "node:assert/strict";
import {
  MOMENT_CAP, INTERJECT_CAP, planCap, kstDayLabel,
  withDailyReset, remaining, msUntilKstMidnight, energyView,
} from "../src/lib/energy";

// kstDayLabel: YYYY-MM-DD in Asia/Seoul. 2026-06-14T00:00:00Z is 09:00 KST same day.
assert.equal(kstDayLabel(Date.parse("2026-06-14T00:00:00Z")), "2026-06-14");
// 2026-06-13T16:00:00Z is 2026-06-14 01:00 KST → next KST day already.
assert.equal(kstDayLabel(Date.parse("2026-06-13T16:00:00Z")), "2026-06-14");

// planCap
assert.equal(planCap("free", "moment"), MOMENT_CAP.free);
assert.equal(planCap("free", "interject"), INTERJECT_CAP.free);
assert.equal(planCap("plus", "moment"), MOMENT_CAP.plus);

// withDailyReset: same day keeps used; different day zeroes.
assert.deepEqual(withDailyReset({ used: 5, day: "2026-06-14" }, "2026-06-14"), { used: 5, day: "2026-06-14" });
assert.deepEqual(withDailyReset({ used: 5, day: "2026-06-13" }, "2026-06-14"), { used: 0, day: "2026-06-14" });
assert.deepEqual(withDailyReset({ used: 0, day: null }, "2026-06-14"), { used: 0, day: "2026-06-14" });

// remaining: floors at 0.
assert.equal(remaining(3, 80), 77);
assert.equal(remaining(90, 80), 0);

// msUntilKstMidnight: in (0, 24h].
const ms = msUntilKstMidnight(Date.parse("2026-06-14T00:00:00Z")); // 09:00 KST → 15h left
assert.equal(ms, 15 * 3600_000);

// energyView math
const v = energyView("free", 80, Date.parse("2026-06-14T00:00:00Z"));
assert.deepEqual(
  { plan: v.plan, used: v.used, cap: v.cap, remaining: v.remaining },
  { plan: "free", used: 80, cap: MOMENT_CAP.free, remaining: 0 },
);

console.log("energy: all assertions passed");
