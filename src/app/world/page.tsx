"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IsoRoom } from "@/components/IsoRoom";
import { RoomChatInput } from "@/components/RoomChatInput";
import { BottomTabs, TopBar } from "@/components/Shell";
import { dummyBubbles, dummyFeed, dummyMembers, dummyWorld } from "@/data/dummyWorld";
import { useProfile } from "@/lib/profileStore";
import type { Member } from "@/types/world";

export default function WorldPage() {
  const router = useRouter();
  const profile = useProfile((s) => s.profile);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // inject the user as a member into the world
  const members: Member[] = useMemo(() => {
    if (!profile) return dummyMembers;
    const me: Member = {
      id: "me",
      worldId: dummyWorld.id,
      name: profile.handle,
      role: "core",
      creature: profile.creature,
      persona: "user",
      speechStyle: "natural",
      presence: "active",
      activityWeight: 1,
      tile: { col: 3, row: 4 },
      outfit: profile.outfit,
    };
    return [me, ...dummyMembers];
  }, [profile]);

  if (hydrated && !profile) {
    router.replace("/signup");
    return null;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black">
      <TopBar title={dummyWorld.title} />
      <div className="relative flex-1">
        <IsoRoom
          mood={dummyWorld.mood}
          members={members}
          bubbles={dummyBubbles}
          ambient={{ rain: true }}
        />
        {/* ambient feed overlay (bottom-left, low-priority) */}
        <div className="absolute left-2 top-2 max-w-[230px] space-y-0.5 text-[10px] text-white/55">
          {dummyFeed.slice(-3).reverse().map((f) => (
            <p key={f.id} className="rounded bg-black/50 px-1.5 py-0.5">
              {f.content}
            </p>
          ))}
        </div>
      </div>
      <RoomChatInput
        kind={profile?.creature ?? "cheerful"}
        outfit={profile?.outfit ?? { shirt: "#2a4ac8", pants: "#1a1f3a" }}
      />
      <BottomTabs active="explore" />
    </main>
  );
}
