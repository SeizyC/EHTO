"use client";

// Admin console shell. Wraps all /admin pages with:
//   · auth gate (session + ADMIN_EMAILS allowlist via /api/admin/me)
//   · sidebar nav between sections (characters, …)
// Only the original world UI sits behind PixelButton-style chrome; admin
// uses a denser, more "dashboard" layout.

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { browserClient } from "@/lib/supabase";
import { useSession } from "@/components/AuthProvider";

type AdminState =
  | { kind: "checking" }
  | { kind: "denied"; reason: string }
  | { kind: "ok"; email: string };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useSession();
  const [state, setState] = useState<AdminState>({ kind: "checking" });

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.session) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const r = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      if (cancelled) return;
      const j = await r.json();
      if (j.admin) setState({ kind: "ok", email: j.email });
      else setState({ kind: "denied", reason: j.reason ?? "not allowed" });
    })();
    return () => { cancelled = true; };
  }, [auth.loading, auth.session, router]);

  if (state.kind === "checking" || auth.loading) {
    return (
      <main className="bg-bg text-ink min-h-dvh px-6 py-12">
        <p className="text-sub text-[13px]">관리자 확인 중…</p>
      </main>
    );
  }
  if (state.kind === "denied") {
    return (
      <main className="bg-bg text-ink min-h-dvh px-6 py-12">
        <h1 className="text-[20px] font-medium">접근 권한 없음</h1>
        <p className="text-sub mt-2 text-[13px]">{state.reason}</p>
        <Link href="/world" className="text-accent mt-6 inline-block text-[13px]">
          ← 광장으로
        </Link>
      </main>
    );
  }

  const navItems = [
    { href: "/admin/characters", label: "AI 캐릭터" },
  ];

  return (
    <main className="bg-bg text-ink mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-6 py-6 lg:flex-row lg:gap-8 lg:py-8">
      <aside className="lg:w-44 shrink-0">
        <div className="mb-6 flex items-baseline justify-between gap-3">
          <h1 className="text-ink text-[15px] font-medium tracking-tight">관리자</h1>
          <span className="text-dim text-[10px]">{state.email}</span>
        </div>
        <nav className="flex flex-row gap-1 lg:flex-col">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "rounded-md px-3 py-1.5 text-[13px] transition " +
                  (active ? "bg-line text-ink" : "text-sub hover:text-ink")
                }
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/world"
            className="text-sub hover:text-ink mt-4 hidden rounded-md px-3 py-1.5 text-[12px] transition lg:block"
          >
            ← 광장
          </Link>
        </nav>
      </aside>
      <section className="min-w-0 flex-1 pt-4 lg:pt-0">{children}</section>
    </main>
  );
}
