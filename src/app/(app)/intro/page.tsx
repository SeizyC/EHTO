"use client";

import { useRouter } from "next/navigation";
import { HeroHuddle } from "@/components/HeroHuddle";
import { LangToggle } from "@/components/LangToggle";
import { PixelButton } from "@/components/PixelButton";
import { useRequireSession } from "@/lib/use-require-session";
import { useLocale } from "@/lib/use-locale";
import { DEFAULT_LOCALE } from "@/lib/about-content";
import { ONBOARDING } from "@/lib/onboarding-content";

// Post-sign-up interstitial: a warm "now make your character" beat with a
// small huddle of sample residents, before the character builder. Routed to
// after onboarding finalize (/start) and the OAuth callback, and as the
// no-character landing for a freshly signed-in user.
export default function IntroPage() {
  const auth = useRequireSession();
  const router = useRouter();
  const { locale, pick } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].intro;

  // useRequireSession redirects to /login when there's no session; render
  // nothing until it settles to avoid a flash.
  if (auth.loading || !auth.session) return null;

  return (
    <main className="grain mx-auto flex min-h-dvh max-w-[480px] flex-col px-6 pb-10 pt-6">
      <header className="mb-2 flex items-center justify-end">
        <LangToggle locale={locale} onPick={pick} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <HeroHuddle />
        <h1 className="text-ink mt-6 text-[22px] font-semibold tracking-[-0.01em]">
          {t.title}
        </h1>
        <p className="text-sub mt-2 max-w-[20rem] text-[14px] leading-[1.7]">
          {t.sub}
        </p>
      </div>

      <PixelButton size="lg" block onClick={() => router.push("/character")}>
        {t.cta} →
      </PixelButton>
    </main>
  );
}
