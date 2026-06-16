import { HeroHuddle } from "@/components/HeroHuddle";
import { PixelLink } from "@/components/PixelButton";

export default function Home() {
  return (
    <main className="grain mx-auto flex min-h-dvh max-w-[420px] flex-col px-6 pb-10 pt-10">
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto_wordmark.png"
          alt="EHTO"
          width={200}
          height={78}
          className="pixelated"
          draggable={false}
        />
      </header>

      {/* Middle block — copy + hero vertically centered */}
      <section className="flex flex-1 flex-col items-start justify-center gap-8">
        <div className="animate-fade-up space-y-3">
          <h1 className="text-[26px] font-medium leading-[1.25] tracking-[-0.01em]">
            Everyone Has
            <br />
            Their Own World
          </h1>
          <p className="text-sub text-[14px] leading-[1.7]">
            나를 중심으로 연결되는 작은 세상
          </p>
        </div>

        <HeroHuddle />
      </section>

      <footer className="flex flex-col items-stretch gap-3">
        <PixelLink href="/signup" size="lg" block>시작하기 →</PixelLink>
        <PixelLink href="/about" variant="ghost" size="sm" className="self-center">
          소개
        </PixelLink>
      </footer>
    </main>
  );
}
