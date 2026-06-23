"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEnergy } from "@/lib/members-store";
import { useTickets, spendTicket } from "@/lib/tickets-store";

// Gamified daily life-energy meter for the /world top bar (spec §6.1).
// A small segmented pip bar that depletes as ambient "moments" are spent.
// It blends into the scene tone (no floating HUD chrome): a row of gold
// pips + a tiny count. When empty, it shifts to a calm "오늘은 여기까지"
// state — the plaza is resting, not dead. Tapping (when empty) opens a calm
// custom modal: spend a "이어서 보기" ticket to wake it now, or the rest note.
const SEGMENTS = 10;

export function EnergyMeter() {
  const e = useEnergy();
  const { balances } = useTickets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!e) return null; // nothing fetched yet — render nothing (no layout jump)

  const ratio = e.cap > 0 ? e.remaining / e.cap : 0;
  const lit = Math.ceil(ratio * SEGMENTS);
  const empty = e.remaining <= 0;
  const hours = Math.max(1, Math.round(e.resetInMs / 3600_000));
  const refills = balances?.refill ?? 0;

  async function useRefill() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const e2 = await spendTicket("refill");
    setBusy(false);
    if (e2) setErr(e2);
    else setOpen(false); // woke the plaza — stores refresh via their own poll
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { if (empty) { setErr(null); setOpen(true); } }}
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !busy && setOpen(false)}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(ev) => ev.stopPropagation()}
              className="bg-surface border-line w-full max-w-[320px] rounded-2xl border p-6 text-center"
            >
              {refills > 0 ? (
                <>
                  <p className="text-ink text-[15px] font-medium">이어서 볼까요?</p>
                  <p className="text-sub mt-2 text-[13px] leading-relaxed">
                    ‘이어서 보기’ 한 장으로 광장을 다시 깨워요.
                    <br />
                    <span className="text-dim">남은 {refills}장</span>
                  </p>
                  {err && <p className="text-accent mt-3 text-[12px]">{err}</p>}
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => setOpen(false)}
                      disabled={busy}
                      className="text-sub flex-1 rounded-md py-2.5 text-[13px] disabled:opacity-60"
                    >
                      다음에
                    </button>
                    <button
                      onClick={useRefill}
                      disabled={busy}
                      className="bg-accent text-bg flex-1 rounded-md py-2.5 text-[13px] font-medium disabled:opacity-60"
                    >
                      {busy ? "여는 중…" : "이어서 보기"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-ink text-[15px] font-medium">오늘은 여기까지</p>
                  <p className="text-sub mt-2 text-[13px] leading-relaxed">
                    자정에 다시 이어져요.
                    <br />
                    <span className="text-dim">약 {hours}시간 후</span>
                  </p>
                  <button
                    onClick={() => setOpen(false)}
                    className="bg-accent text-bg mt-5 w-full rounded-md py-2.5 text-[13px] font-medium"
                  >
                    확인
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
