import clsx from "clsx";
import type { Member, Mood } from "@/types/world";
import { Bubble } from "./Bubble";
import { Creature } from "./Creature";

const MOOD_BG: Record<Mood, string> = {
  cozy: "bg-cozy-bg",
  rainy: "bg-rainy-bg",
  chaotic: "bg-chaotic-bg",
  lonely: "bg-lonely-bg",
};

const MOOD_TINT: Record<Mood, string> = {
  cozy: "bg-cozy-glow/10",
  rainy: "bg-rainy-glow/10",
  chaotic: "bg-chaotic-glow/10",
  lonely: "bg-lonely-glow/10",
};

export function SpatialRoom({
  mood,
  members,
  bubbles,
}: {
  mood: Mood;
  members: Member[];
  bubbles: Record<string, string | null>;
}) {
  return (
    <div className={clsx("relative w-full overflow-hidden", MOOD_BG[mood])} style={{ aspectRatio: "1 / 1" }}>
      <div className={clsx("absolute inset-0", MOOD_TINT[mood])} />
      <div className="absolute inset-0 room-vignette" />

      {/* ambient texture — soft scanlines */}
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)",
        }}
      />

      {members.map((m) => {
        const bubble = bubbles[m.id];
        return (
          <div
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${m.pos.x * 100}%`, top: `${m.pos.y * 100}%` }}
          >
            <div className="flex flex-col items-center gap-1">
              {bubble && <Bubble text={bubble} />}
              <Creature kind={m.creature} presence={m.presence} size={5} />
              <span className="text-[9px] tracking-widest text-white/35">{m.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
