"use client";

import { useEffect, useState } from "react";
import { PixelLink } from "@/components/PixelButton";
import { PlazaShowcase } from "@/components/PlazaShowcase";
import {
  ABOUT,
  LOCALES,
  LOCALE_LABEL,
  LOCALE_BCP47,
  isLocale,
  type Locale,
} from "@/lib/about-content";

const LS_KEY = "ehto:about-locale";

type Props = { initialLocale: Locale };

// Public /about page body. The server picks an initial locale from the
// visitor's IP (cf-ipcountry); this client lets a visitor override it via
// the top-right 한 / 日 / EN toggle and remembers the choice in
// localStorage (override beats IP on the next visit). Keeping the toggle
// visible in production doubles as the in-dev language test surface.
export function AboutClient({ initialLocale }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  // On mount, a stored override wins over the IP-derived initial value.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (isLocale(saved) && saved !== initialLocale) setLocale(saved);
    } catch {
      /* private mode — ignore */
    }
  }, [initialLocale]);

  // Keep <html lang> in sync so assistive tech / crawlers see the active
  // language even after a client-side switch.
  useEffect(() => {
    document.documentElement.lang = LOCALE_BCP47[locale];
  }, [locale]);

  function pick(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const c = ABOUT[locale];

  return (
    <main className="grain mx-auto flex min-h-dvh max-w-[640px] flex-col px-6 pb-16 pt-6">
      <header className="mb-10 flex items-start justify-between gap-4">
        <PixelLink href="/" variant="ghost" size="sm">
          {c.ui.backHome}
        </PixelLink>
        <LangToggle locale={locale} onPick={pick} />
      </header>

      {/* Hero */}
      <section className="animate-fade-up mb-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto.png"
          alt="EHTO"
          width={200}
          height={77}
          className="pixelated mb-6"
          draggable={false}
        />
        <p className="text-gold mb-3 text-[13px] font-medium tracking-[0.02em]">
          {c.tagline}
        </p>
        <h1 className="text-ink text-[22px] font-medium leading-[1.5] tracking-[-0.01em]">
          {c.oneLiner}
        </h1>
      </section>

      {/* Real plaza visuals */}
      <PlazaShowcase locale={locale} />

      {/* Prose sections */}
      <div className="flex flex-col gap-10">
        {c.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-ink mb-3 text-[16px] font-semibold tracking-[-0.01em]">
              {s.heading}
            </h2>
            <div className="flex flex-col gap-3">
              {s.body.map((p, i) => (
                <p key={i} className="text-sub text-[14px] leading-[1.8]">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Features */}
      <section className="mt-12">
        <h2 className="text-ink mb-4 text-[16px] font-semibold tracking-[-0.01em]">
          {c.ui.featuresHeading}
        </h2>
        <ul className="flex flex-col gap-3">
          {c.features.map((f) => (
            <li
              key={f.label}
              className="border-line bg-surface/60 rounded-lg border px-4 py-3"
            >
              <p className="text-ink text-[14px] font-medium">{f.label}</p>
              <p className="text-sub mt-1 text-[13px] leading-[1.7]">{f.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-ink mb-4 text-[16px] font-semibold tracking-[-0.01em]">
          {c.ui.faqHeading}
        </h2>
        <div className="flex flex-col gap-5">
          {c.faq.map((f) => (
            <div key={f.q}>
              <p className="text-ink text-[14px] font-medium leading-[1.6]">
                {f.q}
              </p>
              <p className="text-sub mt-1.5 text-[13px] leading-[1.8]">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-14 flex justify-center">
        <PixelLink href="/signup" size="lg">
          {c.ui.enter}
        </PixelLink>
      </footer>
    </main>
  );
}

function LangToggle({
  locale,
  onPick,
}: {
  locale: Locale;
  onPick: (l: Locale) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className="border-line bg-surface flex items-center gap-0.5 rounded-full border p-0.5"
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            onClick={() => onPick(l)}
            aria-pressed={active}
            className={[
              "rounded-full px-2.5 py-1 text-[12px] font-semibold transition",
              active ? "bg-accent text-bg" : "text-dim active:text-ink",
            ].join(" ")}
          >
            {LOCALE_LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
