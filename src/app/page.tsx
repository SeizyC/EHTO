import Link from "next/link";
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

          <div>
            <PixelLink href="/signup" size="lg" block>
              시작하기 →
            </PixelLink>
          </div>
        </section>
      </div>

      <footer className="text-dim mx-auto flex w-full max-w-[680px] items-center justify-between px-6 pb-6 text-[11px]">
        <Link href="/about" className="hover:text-sub transition">
          소개
        </Link>
        <span>© Fantagram Inc.</span>
      </footer>
    </main>
  );
}
