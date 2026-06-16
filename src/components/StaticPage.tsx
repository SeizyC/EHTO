import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

// Shell for the static/legal pages (terms / privacy / contact).
export function StaticPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grain flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-[680px] flex-1 px-6 pb-12 pt-6">
        <Link href="/" className="text-sub hover:text-ink text-[13px] transition">
          ← 홈
        </Link>
        <h1 className="text-ink mt-6 text-[24px] font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        {updated && <p className="text-dim mt-1.5 text-[12px]">{updated}</p>}
        <div className="mt-8 flex flex-col gap-6">{children}</div>
      </div>
      <SiteFooter />
    </main>
  );
}

export function Section({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-ink mb-2 text-[15px] font-semibold">{h}</h2>
      <div className="text-sub text-[13.5px] leading-[1.8]">{children}</div>
    </section>
  );
}
