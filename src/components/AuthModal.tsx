"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { browserClient } from "@/lib/supabase";
import { PixelButton } from "@/components/PixelButton";
import { ONBOARDING } from "@/lib/onboarding-content";
import type { Locale } from "@/lib/about-content";

// Auth modal for the /start wizard. Google OAuth + email/password.
// onAuthed fires only when a live session exists in THIS page (email path);
// it is AWAITED so the loading state persists through the caller's finalize
// (plaza creation) until the redirect — no silent gap between click and the
// jump to character creation. The Google path redirects to /auth/callback.
export function AuthModal(props: {
  open: boolean;
  onClose: () => void;
  onAuthed: () => void | Promise<void>;
  locale: Locale;
}) {
  const t = ONBOARDING[props.locale].auth;
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);          // email signup/login + finalize
  const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const anyBusy = busy || googleBusy;

  async function google() {
    if (anyBusy) return;
    setGoogleBusy(true);
    setMsg(null);
    const sb = browserClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser navigates away; on error we recover.
    if (error) { setMsg(error.message); setGoogleBusy(false); }
  }

  async function emailSubmit() {
    if (anyBusy) return;
    setBusy(true);
    setMsg(null);
    try {
      const sb = browserClient();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) { setMsg(error.message); return; }
        if (data.session) { await props.onAuthed(); return; } // keep busy through finalize
        setMsg(t.confirmSent);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setMsg(error.message); return; }
        await props.onAuthed();
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = email.includes("@") && password.length >= 6 && !anyBusy;

  return (
    <AnimatePresence>
      {props.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={anyBusy ? undefined : props.onClose}
            className="absolute inset-0 bg-black/55"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "tween", duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="border-line bg-surface relative w-full max-w-sm rounded-2xl border p-6 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]"
          >
            <h2 className="text-ink mb-4 text-[18px] font-semibold tracking-[-0.01em]">
              {mode === "signup" ? t.signupTitle : t.loginTitle}
            </h2>

            <button
              onClick={google}
              disabled={anyBusy}
              className="border-line text-ink mb-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 disabled:opacity-50"
            >
              {googleBusy ? <><Spinner /> {t.googleGoing}</> : t.google}
            </button>

            <div className="my-3 flex flex-col gap-2">
              <input
                type="email"
                placeholder={t.email}
                value={email}
                disabled={anyBusy}
                onChange={(e) => setEmail(e.target.value)}
                className="border-line bg-bg text-ink rounded-xl border px-3 py-2 disabled:opacity-50"
              />
              <input
                type="password"
                placeholder={t.passwordPlaceholder}
                value={password}
                disabled={anyBusy}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) emailSubmit(); }}
                className="border-line bg-bg text-ink rounded-xl border px-3 py-2 disabled:opacity-50"
              />
            </div>

            {msg && <p className="text-sub mb-2 text-sm">{msg}</p>}

            <PixelButton
              variant="primary"
              size="lg"
              block
              disabled={!canSubmit}
              onClick={emailSubmit}
            >
              {busy
                ? <span className="inline-flex items-center gap-2"><Spinner /> {t.working}</span>
                : (mode === "signup" ? t.signupBtn : t.loginBtn)}
            </PixelButton>

            <button
              onClick={() => { if (!anyBusy) { setMsg(null); setMode(mode === "signup" ? "login" : "signup"); } }}
              disabled={anyBusy}
              className="text-sub mt-3 w-full text-center text-sm disabled:opacity-50"
            >
              {mode === "signup" ? t.toLogin : t.toSignup}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Small inline spinner (Tailwind animate-spin).
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
