import Link from "next/link";
import { notFound } from "next/navigation";
import { AmbientFeed } from "@/components/AmbientFeed";
import { AtmosphereHeader } from "@/components/AtmosphereHeader";
import { Composer } from "@/components/Composer";
import { SpatialRoom } from "@/components/SpatialRoom";
import { findMockup, mockups } from "@/data/mockups";

export function generateStaticParams() {
  return mockups.map((m) => ({ id: m.id }));
}

export default function MockupDetail({ params }: { params: { id: string } }) {
  const s = findMockup(params.id);
  if (!s) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black">
      <nav className="border-b border-white/5 px-4 py-2 text-[10px] text-white/40">
        <Link href="/mockups" className="hover:text-white/80">← mockups</Link>
        <span className="ml-3 text-white/30">{s.id}</span>
      </nav>
      <AtmosphereHeader mood={s.mood} title={s.worldTitle} />
      <SpatialRoom mood={s.mood} members={s.members} bubbles={s.bubbles} ambient={s.ambient} />
      <AmbientFeed items={s.feed} members={s.members} />
      <div className="flex-1" />
      <Composer />
    </main>
  );
}
