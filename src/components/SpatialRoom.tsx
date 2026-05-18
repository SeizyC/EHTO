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
  cozy: "bg-cozy-glow/15",
  rainy: "bg-rainy-glow/10",
  chaotic: "bg-chaotic-glow/15",
  lonely: "bg-lonely-glow/5",
};

interface AmbientFx {
  rain?: boolean;
  clutter?: boolean;
  warm?: boolean;
  void?: boolean;
}

export function SpatialRoom({
  mood,
  members,
  bubbles,
  ambient,
}: {
  mood: Mood;
  members: Member[];
  bubbles: Record<string, string | null>;
  ambient?: AmbientFx;
}) {
  return (
    <div className={clsx("relative w-full overflow-hidden", MOOD_BG[mood])} style={{ aspectRatio: "1 / 1" }}>
      <div className={clsx("absolute inset-0", MOOD_TINT[mood])} />
      <div className="absolute inset-0 room-vignette" />

      {/* scanlines */}
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)",
        }}
      />

      {/* warm lamp pool (cozy) */}
      {ambient?.warm && (
        <div
          className="absolute -bottom-12 left-1/2 -translate-x-1/2 h-48 w-72 rounded-full opacity-50 blur-2xl"
          style={{ background: "#ff8e5e" }}
        />
      )}

      {/* rain streaks */}
      {ambient?.rain && (
        <div
          className="absolute inset-0 opacity-30 mix-blend-screen pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(105deg, rgba(180,210,255,0.5) 0 1px, transparent 1px 6px)",
          }}
        />
      )}

      {/* chaotic clutter — random small pixel objects */}
      {ambient?.clutter && (
        <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 100 100" shapeRendering="crispEdges">
          {[
            [10, 12, "#ff5ec4"], [88, 18, "#7af0ff"], [22, 88, "#f4c98a"],
            [76, 82, "#ff5ec4"], [50, 8, "#7af0ff"], [12, 50, "#9ad3a8"],
            [92, 50, "#ff7ab6"], [35, 22, "#7af0ff"], [62, 90, "#f4c98a"],
          ].map(([x, y, c], i) => (
            <rect key={i} x={x as number} y={y as number} width={2} height={2} fill={c as string} opacity={0.7} />
          ))}
        </svg>
      )}

      {/* lonely void — empty space hint */}
      {ambient?.void && (
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5"
            style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.6)" }}
          />
        </div>
      )}

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
