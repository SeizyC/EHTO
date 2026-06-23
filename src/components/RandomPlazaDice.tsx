"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { browserClient } from "@/lib/supabase";
import { RANDOM_VISIT_PRICE } from "@/lib/ehto";
import { EhtoPurchaseModal } from "@/components/EhtoPurchaseModal";

// 🎲 header button next to the plaza name. Rolls EHTO to teleport to a random
// OTHER public plaza. Shows an EHTO-usage confirm modal first; on insufficient
// balance, offers to top up.
export function RandomPlazaDice() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lowEhto, setLowEhto] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  async function roll() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setLowEhto(false);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) { setErr("세션이 만료됐어요. 다시 로그인해주세요."); setBusy(false); return; }
      const r = await fetch("/api/plazas/random", {
        method: "POST",
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      const j = await r.json();
      if (r.ok && j.id) {
        router.push(`/plaza/${j.id}`); // leaves this page
        return;
      }
      if (r.status === 402) { setErr("EHTO가 부족해요."); setLowEhto(true); }
      else setErr(j.error ?? "이동에 실패했어요.");
      setBusy(false);
    } catch {
      setErr("요청 중 오류가 생겼어요.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setErr(null); setLowEhto(false); setOpen(true); }}
        aria-label="다른 광장 구경 (랜덤)"
        title="다른 광장 구경"
        className="text-[18px] leading-none opacity-80 transition hover:opacity-100"
      >
        🎲
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
              <p className="text-ink text-[15px] font-medium">다른 광장으로 떠날까요?</p>
              <p className="text-sub mt-2 text-[13px] leading-relaxed">
                주사위를 굴려 아무 공개 광장에 놀러가요.
                <br />
                <span className="text-dim">EHTO ◆{RANDOM_VISIT_PRICE} 사용</span>
              </p>

              {err && <p className="text-accent mt-3 text-[12px]">{err}</p>}

              <div className="mt-5 flex flex-col gap-2">
                {lowEhto ? (
                  <button
                    onClick={() => setBuyOpen(true)}
                    className="bg-accent text-bg w-full rounded-md py-2.5 text-[13px] font-medium"
                  >
                    EHTO 충전하기
                  </button>
                ) : (
                  <button
                    onClick={roll}
                    disabled={busy}
                    className="bg-accent text-bg w-full rounded-md py-2.5 text-[13px] font-medium disabled:opacity-60"
                  >
                    {busy ? "굴리는 중…" : `굴리기 · ◆${RANDOM_VISIT_PRICE}`}
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="text-sub w-full py-2 text-[13px] disabled:opacity-60"
                >
                  취소
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <EhtoPurchaseModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </>
  );
}
