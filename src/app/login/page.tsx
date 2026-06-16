"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserClient } from "@/lib/supabase";
import { useSession } from "@/components/AuthProvider";
import { PixelButton } from "@/components/PixelButton";
import { landingPathForSession } from "@/lib/character-store";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading: sessLoading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Already-signed-in visit: resolve destination here (LS first, then
    // /api/character/me) and replace directly. Routing through /character
    // first caused a visible flash of the creation screen on returning
    // users.
    if (sessLoading || !session) return;
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
    setSubmitting(true);
    const sb = browserClient();
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (error) {
      setErr(messageForError(error.message));
      return;
    }
    const token = data.session?.access_token;
    const path = token ? await landingPathForSession(token) : "/character";
    router.replace(path);
  }

  return (
    <main className="grain mx-auto flex min-h-dvh max-w-[420px] flex-col px-6 pb-10 pt-10">
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto.png"
          alt="EHTO"
          width={280}
          height={108}
          className="pixelated"
          draggable={false}
        />
      </header>

      <section className="flex flex-1 flex-col justify-center">
        <h1 className="text-ink text-[22px] font-medium leading-tight tracking-[-0.01em]">
          돌아왔어
        </h1>
        <p className="text-sub mt-2 text-[13px] leading-relaxed">
          내 작은 세계로 들어가기.
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
            label="비밀번호"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="mt-2">
            <PixelButton type="submit" disabled={submitting} block>
              {submitting ? "들어가는 중…" : "로그인"}
            </PixelButton>
          </div>
        </form>

        <p className="text-sub mt-6 text-center text-[12.5px]">
          아직 계정이 없어?{" "}
          <Link href="/signup" className="text-ink underline-offset-2 hover:underline">
            가입하기
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
  if (/invalid login credentials/i.test(raw)) return "이메일이나 비밀번호가 안 맞아.";
  if (/email not confirmed/i.test(raw)) return "이메일 확인이 필요해.";
  return raw;
}
