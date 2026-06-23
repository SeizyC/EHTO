"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEnergy, refreshMembers } from "@/lib/members-store";
import { useTickets, spendTicket } from "@/lib/tickets-store";
import { browserClient } from "@/lib/supabase";
import { EhtoPurchaseModal } from "@/components/EhtoPurchaseModal";

// Gamified daily life-energy meter for the /world top bar (spec §6.1).
// A row of gold pips that deplete as ambient "moments" are spent. When empty,
// tapping opens a calm custom modal that offers to wake the plaza now — via a
// "이어서 보기" ticket OR by spending EHTO (energy_refill, ◆1 → +30 moments).
// If the owner has neither, it's the rest note + a path to top up EHTO.
const SEGMENTS = 10;
const REFILL_EHTO = 1; // price of the energy_refill EHTO action

export function EnergyMeter() {
  const e = useEnergy();
  const { balances } = useTickets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ehto, setEhto] = useState<number | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  if (!e) return null; // nothing fetched yet — render nothing (no layout jump)

  const ratio = e.cap > 0 ? e.remaining / e.cap : 0;
  const lit = Math.ceil(ratio * SEGMENTS);
  const empty = e.remaining <= 0;
  const hours = Math.max(1, Math.round(e.resetInMs / 3600_000));
  const refills = balances?.refill ?? 0;
  const canEhto = (ehto ?? 0) >= REFILL_EHTO;

  async function token(): Promise<string | null> {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    return sess.session?.access_token ?? null;
  }

  async function openModal() {
    if (!empty) return;
    setErr(null);
    setOpen(true);
    // Best-effort EHTO balance so we can offer the ◆ continue option.
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/ehto/balance", { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) setEhto((await r.json()).balance);
    } catch { /* leave null — EHTO option just won't show */ }
  }

  async function useTicketRefill() {
    if (busy) return;
    setBusy(true); setErr(null);
    const e2 = await spendTicket("refill");
    if (e2) { setErr(e2); setBusy(false); return; }
    await refreshMembers();
    setBusy(false);
    setOpen(false);
  }

  async function useEhtoRefill() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr("세션이 만료됐어요. 다시 로그인해주세요."); setBusy(false); return; }
      const r = await fetch("/api/ehto/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ action: "energy_refill" }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        if (typeof j.balance === "number") setEhto(j.balance);
        await refreshMembers();
        setOpen(false);
      } else {
        setErr(j.error ?? "이어하기에 실패했어요.");
      }
    } catch {
      setErr("요청 중 오류가 생겼어요.");
    } finally {
      setBusy(false);
    }
  }

  const canContinue = refills > 0 || canEhto;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
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
              <p className="text-ink text-[15px] font-medium">
                {canContinue ? "이어서 볼까요?" : "오늘은 여기까지"}
              </p>
              <p className="text-sub mt-2 text-[13px] leading-relaxed">
                {canContinue
                  ? "광장을 다시 깨워 오늘 더 이어볼 수 있어요."
                  : "자정에 다시 이어져요."}
                <br />
                <span className="text-dim">약 {hours}시간 후 리셋</span>
              </p>

              {err && <p className="text-accent mt-3 text-[12px]">{err}</p>}

              <div className="mt-5 flex flex-col gap-2">
                {refills > 0 && (
                  <button
                    onClick={useTicketRefill}
                    disabled={busy}
                    className="bg-accent text-bg w-full rounded-md py-2.5 text-[13px] font-medium disabled:opacity-60"
                  >
                    {busy ? "여는 중…" : `이어서 보기 · 티켓 ${refills}장`}
                  </button>
                )}
                {canEhto && (
                  <button
                    onClick={useEhtoRefill}
                    disabled={busy}
                    className={
                      "w-full rounded-md py-2.5 text-[13px] font-medium disabled:opacity-60 " +
                      (refills > 0 ? "border-line text-ink border" : "bg-accent text-bg")
                    }
                  >
                    {busy ? "여는 중…" : `EHTO로 이어하기 · ◆${REFILL_EHTO}`}
                  </button>
                )}
                {!canContinue && (
                  <button
                    onClick={() => setBuyOpen(true)}
                    disabled={busy}
                    className="bg-accent text-bg w-full rounded-md py-2.5 text-[13px] font-medium disabled:opacity-60"
                  >
                    EHTO 충전하고 이어하기
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="text-sub w-full py-2 text-[13px] disabled:opacity-60"
                >
                  {canContinue ? "다음에" : "확인"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <EhtoPurchaseModal open={buyOpen} onClose={() => { setBuyOpen(false); openModal(); }} />
    </>
  );
}
