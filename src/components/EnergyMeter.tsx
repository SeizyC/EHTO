"use client";

import { useEnergy } from "@/lib/members-store";
import { useTickets, spendTicket } from "@/lib/tickets-store";

// Gamified daily life-energy meter for the /world top bar (spec §6.1).
// A small segmented pip bar that depletes as ambient "moments" are spent.
// It blends into the scene tone (no floating HUD chrome): a row of gold
// pips + a tiny count. When empty, it shifts to a calm "오늘은 여기까지"
// state — the plaza is resting, not dead. Tapping shows the rest note
// (full Plus sheet lands in a later increment).
const SEGMENTS = 10;

export function EnergyMeter() {
  const e = useEnergy();
  const { balances } = useTickets();
  if (!e) return null; // nothing fetched yet — render nothing (no layout jump)

  const ratio = e.cap > 0 ? e.remaining / e.cap : 0;
  const lit = Math.ceil(ratio * SEGMENTS);
  const empty = e.remaining <= 0;
  const hours = Math.max(1, Math.round(e.resetInMs / 3600_000));

  return (
    <button
      type="button"
      onClick={async () => {
        if (!empty) return;
        // Resting: if the owner holds a "이어서 보기" ticket, offer to spend
        // it to wake the plaza now; otherwise the calm rest note.
        const refills = balances?.refill ?? 0;
        if (refills > 0) {
          if (window.confirm(`이어서 보기 한 장 쓸까요? (남은 ${refills}장)`)) {
            const err = await spendTicket("refill");
            if (err) alert(err);
          }
        } else {
          alert("오늘은 여기까지. 자정에 다시 이어져요.");
        }
      }}
      aria-label={`오늘 남은 분량 ${e.remaining}/${e.cap}`}
      title={empty ? `오늘은 여기까지 · 약 ${hours}시간 후 다시` : `${e.remaining} / ${e.cap}`}
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
        {empty ? "쉼" : e.remaining}
      </span>
    </button>
  );
}
