"use client";

import { PixelLink } from "@/components/PixelButton";
import { LivingPlaza } from "@/components/LivingPlaza";
import { SiteFooter } from "@/components/SiteFooter";
import { LangToggle } from "@/components/LangToggle";
import { useLocale } from "@/lib/use-locale";
import { LANDING, type Locale } from "@/lib/about-content";

export function LandingClient({ initialLocale }: { initialLocale: Locale }) {
  const { locale, pick } = useLocale(initialLocale);
  const t = LANDING[locale];

  return (
    <main className="grain bg-bg relative flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-[680px] items-start justify-between px-6 pt-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto_wordmark.png"
          alt="EHTO"
          width={140}
          height={54}
          className="pixelated"
          draggable={false}
        />
        <LangToggle locale={locale} onPick={pick} />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-8 pb-4">
        <LivingPlaza locale={locale} />

        <section className="mx-auto w-full max-w-[680px] space-y-7 px-6">
          <div className="animate-fade-up space-y-4">
            <h1 className="font-pixel text-ink text-[28px] font-bold leading-[1.35]">
              {t.headline[0]}
              <br />
              {t.headline[1]}
            </h1>
            <p className="font-pixel text-sub text-[14px] leading-[1.8]">{t.sub}</p>
          </div>

          <div>
            <PixelLink href="/signup" size="lg" block className="font-pixel">
              {t.cta}
            </PixelLink>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
