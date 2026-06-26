"use client";

import Link from "next/link";
import { LangToggle } from "@/components/LangToggle";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/use-locale";
import { ABOUT, type Locale } from "@/lib/about-content";
import type { LegalDoc } from "@/lib/legal-content";

// Shell for the static / legal pages (terms / privacy / contact). Mirrors
// AboutClient: the initial locale comes from the server (IP); the top-right
// EN / 한 / 日 toggle overrides it and the choice persists (see useLocale).
export function LegalClient({
  initialLocale,
  doc,
}: {
  initialLocale: Locale;
  doc: Record<Locale, LegalDoc>;
}) {
  const { locale, pick } = useLocale(initialLocale);
  const c = doc[locale];

  return (
    <main className="grain flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-[680px] flex-1 px-6 pb-12 pt-6">
        <header className="flex items-start justify-between gap-4">
          <Link href="/" className="text-sub hover:text-ink text-[13px] transition">
            ← {ABOUT[locale].ui.backHome}
          </Link>
          <LangToggle locale={locale} onPick={pick} />
        </header>

        <h1 className="text-ink mt-6 text-[24px] font-semibold tracking-[-0.01em]">
          {c.title}
        </h1>
        {c.updated && <p className="text-dim mt-1.5 text-[12px]">{c.updated}</p>}

        <div className="mt-8 flex flex-col gap-6">
          {c.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-ink mb-2 text-[15px] font-semibold">{s.h}</h2>
              <div className="text-sub text-[13.5px] leading-[1.8]">
                {s.email && (
                  <a href={`mailto:${s.email}`} className="text-accent hover:underline">
                    {s.email}
                  </a>
                )}
                {s.lines.map((line, i) => (
                  <p key={i} className={s.email && i === 0 ? "mt-1" : undefined}>
                    {line}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
