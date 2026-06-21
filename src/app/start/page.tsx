"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { AuthModal } from "@/components/AuthModal";
import { loadDraft, saveDraft, clearDraft } from "@/lib/onboarding-draft";
import { useLocale } from "@/lib/use-locale";
import { DEFAULT_LOCALE } from "@/lib/about-content";
import { LangToggle } from "@/components/LangToggle";
import { ONBOARDING } from "@/lib/onboarding-content";
import { StartResultDialog } from "@/components/StartResultDialog";
import { PixelButton } from "@/components/PixelButton";

type Step = "code" | "name" | "auth";

export default function StartPage() {
  const router = useRouter();
  const initial = loadDraft();
  const { locale, pick } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].start;
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(initial.code);
  const [roomName, setRoomName] = useState(initial.roomName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Invite-code result surfaces as a modal: success welcomes the user into
  // building their plaza; fail asks them to re-check the code.
  const [result, setResult] = useState<"success" | "fail" | null>(null);

  async function submitCode() {
    if (busy) return;
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/beta/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const j = await r.json();
      if (!j.ok) { setResult("fail"); return; }
      setCode(c);
      saveDraft({ code: c, roomName });
      setResult("success");
    } catch {
      setErr(t.netErr);
    } finally {
      setBusy(false);
    }
  }

  function submitName() {
    const n = roomName.trim();
    if (n.length < 1 || n.length > 16) { setErr(t.nameInvalid); return; }
    setErr(null);
    saveDraft({ code: code.trim().toUpperCase(), roomName: n });
    setStep("auth");
  }

  async function onAuthed() {
    setBusy(true); setErr(null);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) { setErr(t.noSession); return; }
      const r = await fetch("/api/onboarding/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({ code: code.trim().toUpperCase(), roomName: roomName.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409) { setErr(t.codeConsumed); setStep("code"); return; }
        setErr(j.error ?? t.finalizeFail); return;
      }
      clearDraft();
      router.replace("/character");
    } catch {
      setErr(t.netErr);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <div className="absolute right-4 top-4">
        <LangToggle locale={locale} onPick={pick} />
      </div>

      {step === "code" && (
        <>
          <h1 className="text-ink text-xl font-medium">{t.codeTitle}</h1>
          <p className="text-sub text-sm">{t.codeSub}</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t.codePlaceholder}
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2 tracking-widest"
          />
          {err && <p className="text-sub text-sm">{err}</p>}
          <PixelButton variant="primary" size="lg" block onClick={submitCode} disabled={busy || !code.trim()}>
            {t.next}
          </PixelButton>
          <button onClick={() => router.push("/login")} className="text-sub text-center text-sm">
            {t.haveAccount}
          </button>
        </>
      )}

      {step === "name" && (
        <>
          <h1 className="text-ink text-xl font-medium">{t.nameTitle}</h1>
          <p className="text-sub text-sm">{t.nameSub}</p>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={16}
            placeholder={t.namePlaceholder}
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2"
          />
          {err && <p className="text-sub text-sm">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setErr(null); setStep("code"); }}
              className="border-line text-ink flex-1 rounded-xl border py-2.5">{t.back}</button>
            <button onClick={submitName} disabled={!roomName.trim()}
              className="bg-ink text-bg flex-1 rounded-xl py-2.5 font-medium disabled:opacity-40">{t.next}</button>
          </div>
        </>
      )}

      <AuthModal open={step === "auth"} onClose={() => setStep("name")} onAuthed={onAuthed} locale={locale} />
      {step === "auth" && err && <p className="text-sub text-center text-sm">{err}</p>}

      <StartResultDialog
        kind={result}
        copy={t}
        onConfirm={() => { setResult(null); setStep("name"); }}
        onClose={() => setResult(null)}
      />
    </main>
  );
}
