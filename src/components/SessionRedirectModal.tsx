"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Shown on /login and /signup when the visitor ALREADY has a valid session.
// Previously these pages flashed the empty email/password form for a beat and
// then silently redirected — jarring. Now we cover the form with a short notice
// and move on, so it's clear "you're already signed in" rather than a glitch.
export function SessionRedirectModal({
  path,
  title = "이미 로그인되어 있어요",
  sub = "기존 계정으로 이동할게요…",
  delayMs = 1100,
}: {
  path: string;
  title?: string;
  sub?: string;
  delayMs?: number;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);

  function go() {
    if (moving) return;
    setMoving(true);
    router.replace(path);
  }

  useEffect(() => {
    const t = setTimeout(go, delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, delayMs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="bg-surface border-line w-full max-w-[320px] rounded-2xl border p-6 text-center">
        <p className="text-ink text-[15px] font-medium">{title}</p>
        <p className="text-sub mt-2 text-[13px] leading-relaxed">{sub}</p>
        <button
          onClick={go}
          className="bg-accent text-bg mt-5 w-full rounded-md py-2.5 text-[13px] font-medium disabled:opacity-60"
          disabled={moving}
        >
          {moving ? "이동 중…" : "지금 이동"}
        </button>
      </div>
    </div>
  );
}
