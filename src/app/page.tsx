import { PixelLink } from "@/components/PixelButton";
import { LivingPlaza } from "@/components/LivingPlaza";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <main className="grain bg-bg relative flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto w-full max-w-[680px] px-6 pt-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_ehto_wordmark.png"
          alt="EHTO"
          width={140}
          height={54}
          className="pixelated"
          draggable={false}
        />
      </header>

      {/* Plaza + pitch as one block, vertically centered */}
      <div className="flex flex-1 flex-col justify-center gap-8 pb-4">
        <LivingPlaza />

        <section className="mx-auto w-full max-w-[680px] space-y-7 px-6">
          <div className="animate-fade-up space-y-4">
            <h1 className="font-pixel text-ink text-[28px] font-bold leading-[1.35]">
              Everyone Has
              <br />
              Their Own World
            </h1>
            <p className="font-pixel text-sub text-[14px] leading-[1.8]">
              나를 중심으로 연결되는 작은 세상
            </p>
          </div>

          <div>
            <PixelLink href="/signup" size="lg" block className="font-pixel">
              시작하기 →
            </PixelLink>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
