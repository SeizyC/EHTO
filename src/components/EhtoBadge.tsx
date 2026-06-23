"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { EhtoPurchaseModal } from "@/components/EhtoPurchaseModal";

// Compact EHTO balance for page headers, rendered as "{n} ET" (e.g. "200 ET").
// Best-effort: renders nothing until the balance loads. Sits beside MeGlyph.
// Tapping it opens the EHTO 구입 modal.
export function EhtoBadge() {
  const [balance, setBalance] = useState<number | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = browserClient();
        const { data: sess } = await sb.auth.getSession();
        if (!sess.session) return;
        const r = await fetch("/api/ehto/balance", {
          headers: { Authorization: `Bearer ${sess.session.access_token}` },
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setBalance(j.balance);
      } catch {
        /* best-effort — leave hidden */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (balance === null) return null;

  return (
    <>
      <button
        onClick={() => setBuyOpen(true)}
        aria-label="EHTO 구입"
        className="border-line bg-surface mr-1.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums transition active:bg-panel"
      >
        <span className="text-accent">◆</span>
        <span className="text-ink">{balance} ET</span>
      </button>
      <EhtoPurchaseModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </>
  );
}
