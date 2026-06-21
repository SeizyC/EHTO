"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase";
import { ONBOARDING } from "@/lib/onboarding-content";
import type { Locale } from "@/lib/about-content";

// Auth modal for the /start wizard. Google OAuth + email/password.
// onAuthed fires only when a live session exists in THIS page (email path).
// The Google path redirects to /auth/callback which resumes finalize there.
export function AuthModal(props: {
  open: boolean;
  onClose: () => void;
  onAuthed: () => void;
  locale: Locale;
}) {
  const t = ONBOARDING[props.locale].auth;
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!props.open) return null;

  async function google() {
    const sb = browserClient();
    setMsg(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setMsg(error.message);
  }

  async function emailSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const sb = browserClient();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) { setMsg(error.message); return; }
        if (data.session) { props.onAuthed(); return; }
        setMsg(t.confirmSent);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setMsg(error.message); return; }
        props.onAuthed();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.includes("@") && password.length >= 6 && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={props.onClose}
    >
      <div
        className="border-line bg-surface w-full max-w-sm rounded-2xl border p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-ink mb-4 text-lg font-medium">
          {mode === "signup" ? t.signupTitle : t.loginTitle}
        </h2>

        <button
          onClick={google}
          className="border-line text-ink mb-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5"
        >
          {t.google}
        </button>

        <div className="my-3 flex flex-col gap-2">
          <input
            type="email"
            placeholder={t.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2"
          />
          <input
            type="password"
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2"
          />
        </div>

        {msg && <p className="text-muted mb-2 text-sm">{msg}</p>}

        <button
          disabled={!canSubmit}
          onClick={emailSubmit}
          className="bg-ink text-bg w-full rounded-xl py-2.5 font-medium disabled:opacity-40"
        >
          {mode === "signup" ? t.signupBtn : t.loginBtn}
        </button>

        <button
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          className="text-muted mt-3 w-full text-center text-sm"
        >
          {mode === "signup" ? t.toLogin : t.toSignup}
        </button>
      </div>
    </div>
  );
}
