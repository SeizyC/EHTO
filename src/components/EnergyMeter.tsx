"use client";

import { useEnergy } from "@/lib/members-store";

// Gamified daily life-energy meter for the /world top bar (spec §6.1).
// A small segmented pip bar that depletes as ambient "moments" are spent.
// It blends into the scene tone (no floating HUD chrome): a row of gold
// pips + a tiny count. When empty, it shifts to a calm "쉬는 중 · 자정 충전"
// state — the plaza is resting, not dead. Tapping opens the upsell (stubbed
// for this increment).
const SEGMENTS = 10;

export function EnergyMeter() {
  const e = useEnergy();
  if (!e) return null; // nothing fetched yet — render nothing (no layout jump)

  const ratio = e.cap > 0 ? e.remaining / e.cap : 0;
  const lit = Math.ceil(ratio * SEGMENTS);
  const empty = e.remaining <= 0;
  const hours = Math.max(1, Math.round(e.resetInMs / 3600_000));

  return (
    <button
      type="button"
      onClick={() => {
        // Upsell entry point — full Plus sheet lands in a later increment.
        alert("매일 자정에 충전돼요. 더 북적이는 광장은 곧 Plus에서 만나요.");
      }}
      aria-label={`오늘의 생명력 ${e.remaining}/${e.cap}`}
      title={empty ? `쉬는 중 · 약 ${hours}시간 후 충전` : `생명력 ${e.remaining}/${e.cap}`}
      className="flex items-center gap-1.5 rounded-full px-1 py-0.5"
    >
      <span className="flex items-center gap-[2px]" aria-hidden>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            className={[
              "h-2.5 w-[3px] rounded-full transition-colors",
              i < lit && !empty ? "bg-gold" : "bg-line",
            ].join(" ")}
            style={i < lit && !empty ? { boxShadow: "0 0 5px rgba(212,176,98,0.55)" } : undefined}
          />
        ))}
      </span>
      <span className={["text-[11px] tabular-nums", empty ? "text-dim" : "text-gold-dim"].join(" ")}>
        {empty ? `쉼 · ~${hours}h` : e.remaining}
      </span>
    </button>
  );
}
