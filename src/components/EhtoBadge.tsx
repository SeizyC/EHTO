"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

// Compact EHTO balance for page headers, rendered as "{n} ET" (e.g. "200 ET").
// Best-effort: renders nothing until the balance loads. Sits beside MeGlyph.
export function EhtoBadge() {
  const [balance, setBalance] = useState<number | null>(null);

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
    <span className="border-line bg-surface mr-1.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums">
      <span className="text-accent">◆</span>
      <span className="text-ink">{balance} ET</span>
    </span>
  );
}
