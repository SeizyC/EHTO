"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PixelButton, PixelLink } from "@/components/PixelButton";
import { PlazaShowcase } from "@/components/PlazaShowcase";
import { LangToggle } from "@/components/LangToggle";
import { SiteFooter } from "@/components/SiteFooter";
import { AuthModal } from "@/components/AuthModal";
import { browserClient } from "@/lib/supabase";
import { landingPathForSession } from "@/lib/character-store";
import { useLocale } from "@/lib/use-locale";
import { ABOUT, type Locale } from "@/lib/about-content";

type Props = { initialLocale: Locale };

// Public /about page body. Initial locale from the server (IP); the top-right
// EN / 한 / 日 toggle overrides it and the choice persists (see useLocale).
export function AboutClient({ initialLocale }: Props) {
  const { locale, pick } = useLocale(initialLocale);
  const c = ABOUT[locale];
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);

  // After an in-place email auth, route to the right landing for this session
  // (existing users → their plaza; new users with no plaza → /start to enter an
  // invite code). The Google path returns via /auth/callback, which does the
  // same draft-less routing.
  async function onAuthed() {
    const sb = browserClient();
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (token) router.replace(await landingPathForSession(token));
  }

  return (
    <>
    <main className="grain mx-auto flex max-w-[640px] flex-col px-6 pb-16 pt-6">
      <header className="mb-10 flex items-start justify-between gap-4">
        <PixelLink href="/" variant="ghost" size="sm">
          {c.ui.backHome}
        </PixelLink>
        <div className="flex items-center gap-2">
          <PixelButton
            variant="primary"
            size="sm"
            onClick={() => setAuthOpen(true)}
            aria-label={c.ui.enter}
            title={c.ui.enter}
            className="!px-3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </PixelButton>
          <LangToggle locale={locale} onPick={pick} />
        </div>
      </header>

      {/* Hero */}
      <section className="animate-fade-up mb-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto_wordmark.webp"
          alt="EHTO"
          width={153}
          height={60}
          className="pixelated mb-6"
          draggable={false}
        />
        <p data-speakable className="text-gold mb-3 text-[13px] font-medium tracking-[0.02em]">
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

      <footer className="mt-14 flex justify-end">
        <PixelLink href="/start" size="lg">
          {c.ui.enter}
        </PixelLink>
      </footer>
    </main>
    <SiteFooter />
    <AuthModal
      open={authOpen}
      onClose={() => setAuthOpen(false)}
      onAuthed={onAuthed}
      locale={locale}
    />
    </>
  );
}
