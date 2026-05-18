import { AmbientFeed } from "@/components/AmbientFeed";
import { AtmosphereHeader } from "@/components/AtmosphereHeader";
import { Composer } from "@/components/Composer";
import { SpatialRoom } from "@/components/SpatialRoom";
import { dummyBubbles, dummyFeed, dummyMembers, dummyWorld } from "@/data/dummyWorld";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black">
      <AtmosphereHeader mood={dummyWorld.mood} title={dummyWorld.title} />
      <SpatialRoom mood={dummyWorld.mood} members={dummyMembers} bubbles={dummyBubbles} />
      <AmbientFeed items={dummyFeed} members={dummyMembers} />
      <div className="flex-1" />
      <Composer />
    </main>
  );
}
