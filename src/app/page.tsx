import Link from "next/link";
import { AmbientFeed } from "@/components/AmbientFeed";
import { AtmosphereHeader } from "@/components/AtmosphereHeader";
import { Composer } from "@/components/Composer";
import { SpatialRoom } from "@/components/SpatialRoom";
import { dummyBubbles, dummyFeed, dummyMembers, dummyWorld } from "@/data/dummyWorld";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black">
      <AtmosphereHeader mood={dummyWorld.mood} title={dummyWorld.title} />
      <SpatialRoom mood={dummyWorld.mood} members={dummyMembers} bubbles={dummyBubbles} ambient={{ rain: true }} />
      <AmbientFeed items={dummyFeed} members={dummyMembers} />
      <div className="flex-1" />
      <nav className="flex items-center justify-between border-t border-white/5 px-4 py-2 text-[10px] text-white/35">
        <Link href="/mockups" className="hover:text-white/80">→ mockups</Link>
        <Link href="/identity" className="hover:text-white/80">→ identity</Link>
      </nav>
      <Composer />
    </main>
  );
}
