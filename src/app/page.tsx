import { PixelLink } from "@/components/PixelButton";
import { LivingPlaza } from "@/components/LivingPlaza";

export default function Home() {
  return (
    <main className="grain bg-bg relative flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto w-full max-w-[680px] px-6 pt-7">
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

      {/* Bright, living plaza window (natural aspect, not cover-zoomed) */}
      <LivingPlaza />

      {/* Pitch over the dark bg — fully legible, no scrim needed */}
      <section className="mx-auto flex w-full max-w-[680px] flex-1 flex-col justify-end gap-7 px-6 pb-10 pt-6">
        <div className="animate-fade-up space-y-3">
          <h1 className="text-ink text-[30px] font-semibold leading-[1.18] tracking-[-0.01em]">
            Everyone Has
            <br />
            Their Own World
          </h1>
          <p className="text-sub text-[15px] leading-[1.7]">
            나를 중심으로 연결되는 작은 세상
          </p>
        </div>

        <footer className="flex flex-col items-stretch gap-3">
          <PixelLink href="/signup" size="lg" block>
            시작하기 →
          </PixelLink>
          <PixelLink href="/about" variant="ghost" size="sm" className="self-center">
            소개
          </PixelLink>
        </footer>
      </section>
    </main>
  );
}
