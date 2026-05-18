import Link from "next/link";
import { notFound } from "next/navigation";
import { IsoRoom } from "@/components/IsoRoom";
import { BottomTabs, TopBar } from "@/components/Shell";
import { findMockup, mockups } from "@/data/mockups";

export function generateStaticParams() {
  return mockups.map((m) => ({ id: m.id }));
}

export default function MockupDetail({ params }: { params: { id: string } }) {
  const s = findMockup(params.id);
  if (!s) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black">
      <TopBar title={s.worldTitle} />
      <nav className="border-b border-white/5 bg-black/50 px-4 py-1.5 text-[10px] text-white/40">
        <Link href="/mockups" className="hover:text-white/80">← mockups</Link>
        <span className="ml-3 text-white/30">{s.id}</span>
      </nav>
      <div className="relative flex-1">
        <IsoRoom mood={s.mood} members={s.members} bubbles={s.bubbles} ambient={s.ambient} />
        <div className="absolute left-2 top-2 max-w-[230px] space-y-0.5 text-[10px] text-white/55">
          {s.feed.slice(-3).reverse().map((f) => (
            <p key={f.id} className="rounded bg-black/50 px-1.5 py-0.5">{f.content}</p>
          ))}
        </div>
      </div>
      <BottomTabs active="explore" />
    </main>
  );
}
