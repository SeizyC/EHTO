"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserClient } from "@/lib/supabase";
import { useSession } from "@/components/AuthProvider";
import { clearCharacter, landingPathForSession } from "@/lib/character-store";
import { PixelButton } from "@/components/PixelButton";
import { useLocale } from "@/lib/use-locale";
import { DEFAULT_LOCALE } from "@/lib/about-content";
import { LangToggle } from "@/components/LangToggle";
import { ONBOARDING } from "@/lib/onboarding-content";

export default function SignupPage() {
  const router = useRouter();
  const { session, loading: sessLoading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Track that this mount initiated a signup so the session effect below
  // doesn't race the manual router.replace to /character.
  const justSignedUp = useRef(false);

  const { locale, pick } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].signup;

  useEffect(() => {
    if (sessLoading || !session) return;
    if (justSignedUp.current) return; // already routing to /character
    // Already-logged-in visitor who wandered into /signup → resolve
    // destination here (LS first, then /api/character/me) so a returning
    // user with a finished character skips the creation screen entirely.
    let cancelled = false;
    (async () => {
      const path = await landingPathForSession(session.access_token);
      if (!cancelled) router.replace(path);
    })();
    return () => { cancelled = true; };
  }, [sessLoading, session, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErr(null);
    if (password.length < 6) {
      setErr(t.errShortPw);
      return;
    }
    if (password !== passwordConfirm) {
      setErr(t.errMismatch);
      return;
    }
    setSubmitting(true);
    const sb = browserClient();
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (error) {
      setErr(messageForError(error.message, t));
      return;
    }
    if (data.session) {
      // New account → wipe any stale character/world cache from a previous
      // logged-in user on this browser, then send to character creation.
      justSignedUp.current = true;
      clearCharacter();
      router.replace("/character");
    } else {
      setErr(t.confirmSent);
    }
  }

  return (
    <main className="grain mx-auto flex min-h-dvh max-w-[420px] flex-col px-6 pb-10 pt-10">
      <header className="flex items-start justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto_wordmark.png"
          alt="EHTO"
          width={170}
          height={66}
          className="pixelated"
          draggable={false}
        />
        <LangToggle locale={locale} onPick={pick} />
      </header>

      <section className="flex flex-1 flex-col justify-center">
        <h1 className="text-ink text-[22px] font-medium leading-tight tracking-[-0.01em]">
          {t.title}
        </h1>
        <p className="text-sub mt-2 text-[13px] leading-relaxed">
          {t.sub}
        </p>

        <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3">
          <Field
            label={t.email}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            label={t.password}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
          <Field
            label={t.passwordConfirm}
            type="password"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            autoComplete="new-password"
            required
          />
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="mt-2">
            <PixelButton type="submit" disabled={submitting} block>
              {submitting ? t.submitting : t.submit}
            </PixelButton>
          </div>
        </form>

        <p className="text-sub mt-6 text-center text-[12.5px]">
          {t.haveAccount}{" "}
          <Link href="/login" className="text-ink underline-offset-2 hover:underline">
            {t.loginLink}
          </Link>
        </p>
      </section>
    </main>
  );
}

function Field(props: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sub text-[12px] font-medium">{props.label}</span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required={props.required}
        className="border-line bg-surface text-ink rounded-md border px-3 py-2.5 text-[14px] outline-none focus:border-white/40"
      />
    </label>
  );
}

function messageForError(raw: string, t: typeof ONBOARDING["ko"]["signup"]): string {
  if (/already registered|user.*exists/i.test(raw)) return t.errEmailTaken;
  if (/password should be/i.test(raw)) return t.errPwShort;
  if (/invalid email/i.test(raw)) return t.errBadEmail;
  return raw;
}
