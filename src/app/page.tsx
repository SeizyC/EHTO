import { PixelLink } from "@/components/PixelButton";
import { LivingPlaza } from "@/components/LivingPlaza";

export default function Home() {
  return (
    <main className="grain relative flex min-h-dvh w-full flex-col overflow-hidden">
      {/* Full-bleed living plaza behind everything */}
      <LivingPlaza />

      {/* Overlay — wordmark top, headline + single CTA bottom */}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col px-6 pb-10 pt-8">
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo_ehto_wordmark.png"
            alt="EHTO"
            width={180}
            height={70}
            className="pixelated"
            draggable={false}
          />
        </header>

        <div className="flex-1" />

        <section className="animate-fade-up space-y-3 pb-2">
          <h1 className="text-ink text-[30px] font-semibold leading-[1.18] tracking-[-0.01em] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
            Everyone Has
            <br />
            Their Own World
          </h1>
          <p className="text-sub text-[15px] leading-[1.7]">
            나를 중심으로 연결되는 작은 세상
          </p>
        </section>

        <footer className="mt-7 flex flex-col items-stretch gap-3">
          <PixelLink href="/signup" size="lg" block>
            시작하기 →
          </PixelLink>
          <PixelLink href="/about" variant="ghost" size="sm" className="self-center">
            소개
          </PixelLink>
        </footer>
      </div>
    </main>
  );
}
