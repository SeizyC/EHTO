"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { useLocale } from "@/lib/use-locale";
import { DEFAULT_LOCALE } from "@/lib/about-content";
import { ONBOARDING } from "@/lib/onboarding-content";

type MyCode = { code: string; used: boolean };

export function InvitePanel(props: { open: boolean }) {
  const [codes, setCodes] = useState<MyCode[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].invite;

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = browserClient();
        const { data: sess } = await sb.auth.getSession();
        if (!sess.session) return;
        const r = await fetch("/api/beta/my-codes", {
          headers: { Authorization: `Bearer ${sess.session.access_token}` },
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setCodes((j.codes ?? []) as MyCode[]);
      } catch { /* transient — leave as null, reopen retries */ }
    })();
    return () => { cancelled = true; };
  }, [props.open]);

  if (!codes) return null;
  const usedCount = codes.filter((c) => c.used).length;

  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); setCopied(code); }
    catch { /* clipboard blocked — ignore */ }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-sm font-medium">{t.title}</h3>
        <span className="text-sub text-xs">{t.status.replace("{used}", String(usedCount)).replace("{total}", String(codes.length))}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {codes.map((c) => (
          <li key={c.code}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              c.used ? "border-line text-sub opacity-50" : "border-line text-ink"
            }`}>
            <span className="font-mono tracking-widest">{c.code}</span>
            {c.used ? (
              <span className="text-xs">{t.used}</span>
            ) : (
              <button onClick={() => copy(c.code)} className="text-sub text-xs">
                {copied === c.code ? t.copied : t.copy}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
