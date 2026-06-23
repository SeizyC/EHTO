"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { browserClient } from "@/lib/supabase";
import { EHTO_PACKS } from "@/lib/ehto-packs";

// EHTO 구입 모달 — opened by tapping the EHTO balance (header badge or the /me
// wallet). Picks a pack → Stripe Checkout → redirect. EHTO is granted by the
// webhook on payment success, so the balance updates on return.
export function EhtoPurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [buying, setBuying] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function buy(packId: string) {
    if (buying) return;
    setBuying(packId);
    setErr(null);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        setErr("세션이 만료됐어요. 다시 로그인해주세요.");
        setBuying(null);
        return;
      }
      const r = await fetch("/api/ehto/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session.access_token}` },
        body: JSON.stringify({ packId }),
      });
      const j = await r.json();
      if (r.ok && j.url) {
        window.location.href = j.url as string;
      } else {
        setErr(j.error ?? "결제를 시작할 수 없어요.");
        setBuying(null);
      }
    } catch {
      setErr("요청 중 오류가 생겼어요.");
      setBuying(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border-line w-full max-w-[400px] rounded-2xl border p-5"
          >
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-ink text-[15px] font-medium">EHTO 구입</h3>
              <button onClick={onClose} aria-label="닫기" className="text-dim hover:text-ink text-[20px] leading-none">
                ×
              </button>
            </div>
            <p className="text-sub mb-4 text-[12px] leading-relaxed">Stripe 보안 결제창에서 진행됩니다.</p>

            <div className="grid grid-cols-2 gap-2.5">
              {EHTO_PACKS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => buy(p.id)}
                  disabled={buying !== null}
                  className={
                    "border-line relative rounded-xl border px-3 py-3 text-left transition active:bg-panel disabled:opacity-60 " +
                    (p.featured ? "border-accent" : "")
                  }
                >
                  {p.featured && (
                    <span className="text-accent absolute right-2 top-2 text-[9px] font-medium">추천</span>
                  )}
                  <span className="tabular-nums block text-[16px] font-semibold" style={{ color: "#E89B6C" }}>
                    ◆ {p.ehto}
                  </span>
                  <span className="text-sub mt-0.5 block text-[12px]">
                    {buying === p.id ? "이동 중…" : `₩${p.priceKrw.toLocaleString()}`}
                  </span>
                </button>
              ))}
            </div>

            {err && <p className="text-accent mt-3 text-[12px]">{err}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
