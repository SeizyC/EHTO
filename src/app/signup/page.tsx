"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserClient } from "@/lib/supabase";
import { useSession } from "@/components/AuthProvider";
import { clearCharacter, landingPathForSession } from "@/lib/character-store";
import { PixelButton } from "@/components/PixelButton";

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
      setErr("비밀번호는 6자 이상이어야 해.");
      return;
    }
    if (password !== passwordConfirm) {
      setErr("비밀번호가 일치하지 않아.");
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
      setErr(messageForError(error.message));
      return;
    }
    if (data.session) {
      // New account → wipe any stale character/world cache from a previous
      // logged-in user on this browser, then send to character creation.
      justSignedUp.current = true;
      clearCharacter();
      router.replace("/character");
    } else {
      setErr("이메일 확인 메일을 보냈어. 링크 클릭 후 로그인해줘.");
    }
  }

  return (
    <main className="grain mx-auto flex min-h-dvh max-w-[420px] flex-col px-6 pb-10 pt-10">
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto_wordmark.png"
          alt="EHTO"
          width={170}
          height={66}
          className="pixelated"
          draggable={false}
        />
      </header>

      <section className="flex flex-1 flex-col justify-center">
        <h1 className="text-ink text-[22px] font-medium leading-tight tracking-[-0.01em]">
          작은 세계를 만들자
        </h1>
        <p className="text-sub mt-2 text-[13px] leading-relaxed">
          이메일로 가입해 내 광장을 가져.
        </p>

        <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3">
          <Field
            label="이메일"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            label="비밀번호 (6자 이상)"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
          <Field
            label="비밀번호 확인"
            type="password"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            autoComplete="new-password"
            required
          />
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="mt-2">
            <PixelButton type="submit" disabled={submitting} block>
              {submitting ? "만드는 중…" : "가입하기"}
            </PixelButton>
          </div>
        </form>

        <p className="text-sub mt-6 text-center text-[12.5px]">
          이미 계정이 있어?{" "}
          <Link href="/login" className="text-ink underline-offset-2 hover:underline">
            로그인
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

function messageForError(raw: string): string {
  if (/already registered|user.*exists/i.test(raw)) return "이미 가입된 이메일이야. 로그인해줘.";
  if (/password should be/i.test(raw)) return "비밀번호가 너무 짧아 (6자 이상).";
  if (/invalid email/i.test(raw)) return "이메일 형식이 이상해.";
  return raw;
}
