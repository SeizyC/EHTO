import clsx from "clsx";
import type { CreatureKind, Presence } from "@/types/world";

const KIND_COLOR: Record<CreatureKind, string> = {
  cozy_spirit: "#f4c98a",
  glitch_robot: "#7af0ff",
  floating_ghost: "#b6c2ff",
  sleepy_blob: "#9ad3a8",
  tiny_monster: "#ff7ab6",
};

const KIND_SHAPE: Record<CreatureKind, string[]> = {
  // 8×8 pixel silhouette per row (0/1). Faces deliberately non-human.
  cozy_spirit: [
    "00111100",
    "01111110",
    "11011011",
    "11111111",
    "11000011",
    "11111111",
    "01100110",
    "00100100",
  ],
  glitch_robot: [
    "01111110",
    "10000001",
    "10110101",
    "10000001",
    "01111110",
    "00100100",
    "01111110",
    "10000001",
  ],
  floating_ghost: [
    "00111100",
    "01111110",
    "11011011",
    "11111111",
    "11111111",
    "11111111",
    "10101010",
    "01010101",
  ],
  sleepy_blob: [
    "00000000",
    "00111100",
    "01111110",
    "11011011",
    "11111111",
    "11111111",
    "01111110",
    "00111100",
  ],
  tiny_monster: [
    "10000001",
    "11000011",
    "01111110",
    "11100111",
    "11111111",
    "11011011",
    "01111110",
    "00100100",
  ],
};

const PRESENCE_ANIM: Record<Presence, string> = {
  active: "animate-idle",
  lurking: "animate-breathe opacity-50",
  idle: "animate-breathe",
  away: "opacity-25",
};

export function Creature({
  kind,
  presence,
  size = 6,
}: {
  kind: CreatureKind;
  presence: Presence;
  size?: number; // px per cell
}) {
  const shape = KIND_SHAPE[kind];
  const color = KIND_COLOR[kind];
  const isGlitch = kind === "glitch_robot";

  return (
    <div
      className={clsx("pixelated select-none", PRESENCE_ANIM[presence], isGlitch && "animate-flicker")}
      style={{
        width: size * 8,
        height: size * 8,
        filter: `drop-shadow(0 0 ${size * 0.8}px ${color}55)`,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 8 8" width={size * 8} height={size * 8} shapeRendering="crispEdges">
        {shape.flatMap((row, y) =>
          row.split("").map((c, x) =>
            c === "1" ? (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}
