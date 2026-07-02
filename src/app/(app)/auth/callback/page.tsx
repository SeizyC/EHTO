"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { loadDraft, clearDraft } from "@/lib/onboarding-draft";
import { landingPathForSession } from "@/lib/character-store";
import { useLocale } from "@/lib/use-locale";
import { DEFAULT_LOCALE } from "@/lib/about-content";
import { ONBOARDING } from "@/lib/onboarding-content";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].callback;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = browserClient();
      // PKCE form (?code=...) — exchange if present. Implicit/hash sessions
      // are auto-detected by the client, so this is best-effort.
      try {
        if (typeof window !== "undefined" && window.location.search.includes("code=")) {
          await sb.auth.exchangeCodeForSession(window.location.href);
        }
      } catch { /* may already be exchanged by auto-detect */ }

      const { data: sess } = await sb.auth.getSession();
      if (cancelled) return;
      if (!sess.session) { setErr(t.failed); return; }
      const token = sess.session.access_token;

      const draft = loadDraft();
      if (draft.code && draft.roomName) {
        const r = await fetch("/api/onboarding/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            code: draft.code,
            roomName: draft.roomName,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        if (!cancelled && r.ok) {
          clearDraft();
          router.replace("/intro");
          return;
        }
        if (!cancelled && r.status === 409) {
          router.replace("/start");
          return;
        }
      }
      if (!cancelled) router.replace(await landingPathForSession(token));
    })();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sub text-sm">{err ?? t.entering}</p>
    </main>
  );
}
