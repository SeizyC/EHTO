import clsx from "clsx";
import type { CreatureKind, Outfit, Presence } from "@/types/world";

// --- creature face shapes (12×12 grid, centered) -------------------------

const FACE_COLOR: Record<CreatureKind, string> = {
  cozy_spirit: "#f4c98a",
  glitch_robot: "#7af0ff",
  floating_ghost: "#dfe5ff",
  sleepy_blob: "#9ad3a8",
  tiny_monster: "#ff7ab6",
};

const FACE_ACCENT: Record<CreatureKind, string> = {
  cozy_spirit: "#3a2418",
  glitch_robot: "#0a1820",
  floating_ghost: "#222a3a",
  sleepy_blob: "#1c2a20",
  tiny_monster: "#3a0e22",
};

// 10×10 silhouette per kind ("1" = body color, "2" = accent like eye)
const FACE: Record<CreatureKind, string[]> = {
  cozy_spirit: [
    "0001111000",
    "0011111100",
    "0111111110",
    "1112112111",
    "1111111111",
    "1111111111",
    "1112002111",
    "0111111110",
    "0011111100",
    "0010010000",
  ],
  glitch_robot: [
    "0111111110",
    "1100000011",
    "1102002011",
    "1100000011",
    "1102222011",
    "1100000011",
    "1102002011",
    "1100000011",
    "0111111110",
    "0010000100",
  ],
  floating_ghost: [
    "0011111100",
    "0111111110",
    "1112112111",
    "1111111111",
    "1112112111",
    "1111111111",
    "1111111111",
    "1011111101",
    "0101101010",
    "0010110100",
  ],
  sleepy_blob: [
    "0000000000",
    "0011111100",
    "0111111110",
    "1111111111",
    "1122002211",
    "1112002111",
    "1111111111",
    "0111111110",
    "0011111100",
    "0001111000",
  ],
  tiny_monster: [
    "1100000011",
    "1110000111",
    "0111111110",
    "1112112111",
    "1111111111",
    "1110000111",
    "1112112111",
    "1111111111",
    "0111111110",
    "0010000100",
  ],
};

// --- body sprite ---------------------------------------------------------
// 16 wide × 28 tall, drawn relative to feet (anchor at bottom-center).
// H = head box (face composited inside), S = skin/neck, C = shirt, P = pants

const BODY: string[] = [
  // y=0..10 head reserved (we composite face SVG instead)
  // y=11 neck
  "0000000SS0000000",
  // y=12..14 shoulders/shirt top
  "000CCCCCCCCC0000",
  "00CCCCCCCCCCC000",
  "00CCCCCCCCCCC000",
  // y=15..18 torso
  "00CCCCCCCCCCC000",
  "00CCCCCCCCCCC000",
  "00CCCCCCCCCCC000",
  "00CCCCCCCCCCC000",
  // y=19..21 belt/hips
  "000CCCCCCCCC0000",
  "000CCCCCCCCC0000",
  "000PPPPPPPPP0000",
  // y=22..25 pants
  "000PPPP0PPPP0000",
  "000PPPP0PPPP0000",
  "000PPPP0PPPP0000",
  "000PPPP0PPPP0000",
  // y=26..27 feet
  "00ZZZZZ0ZZZZZ000",
  "00ZZZZZ0ZZZZZ000",
];

// pixel size in css px
const PX = 3;

const PRESENCE_ANIM: Record<Presence, string> = {
  active: "animate-idle",
  lurking: "animate-breathe opacity-60",
  idle: "animate-breathe",
  away: "opacity-30",
};

export function Character({
  kind,
  presence,
  outfit,
  size = PX,
  ringColor,
}: {
  kind: CreatureKind;
  presence: Presence;
  outfit: Outfit;
  size?: number;
  ringColor?: string;
}) {
  const W = 16;
  const H = 28;
  const skin = FACE_COLOR[kind];

  const shirt = outfit.shirt;
  const pants = outfit.pants;
  const shoes = outfit.shoes ?? "#1a1620";

  // body pixels
  const bodyRects = BODY.flatMap((row, y) =>
    row.split("").map((c, x) => {
      if (c === "0") return null;
      const fill =
        c === "S" ? skin : c === "C" ? shirt : c === "P" ? pants : c === "Z" ? shoes : null;
      if (!fill) return null;
      return <rect key={`b-${x}-${y}`} x={x} y={y + 11} width={1} height={1} fill={fill} />;
    }),
  );

  // face area: rows 0..10, columns 3..12 (10×10) — but BODY has neck at y=11
  const face = FACE[kind];
  const accent = FACE_ACCENT[kind];
  const faceRects = face.flatMap((row, y) =>
    row.split("").map((c, x) => {
      if (c === "0") return null;
      const fill = c === "2" ? accent : skin;
      return <rect key={`f-${x}-${y}`} x={x + 3} y={y + 1} width={1} height={1} fill={fill} />;
    }),
  );

  // hat
  const hatRects: React.ReactNode[] = [];
  if (outfit.hat && outfit.hat.kind !== "none") {
    const hatColor = outfit.hat.color ?? "#ffffff";
    if (outfit.hat.kind === "cap") {
      // small brim cap at y=0..1
      for (let x = 3; x <= 12; x++) hatRects.push(<rect key={`h0-${x}`} x={x} y={0} width={1} height={1} fill={hatColor} />);
      for (let x = 2; x <= 13; x++) hatRects.push(<rect key={`h1-${x}`} x={x} y={1} width={1} height={1} fill={hatColor} />);
    } else if (outfit.hat.kind === "beanie") {
      for (let x = 3; x <= 12; x++) hatRects.push(<rect key={`h0-${x}`} x={x} y={0} width={1} height={2} fill={hatColor} />);
    } else if (outfit.hat.kind === "halo") {
      for (let x = 4; x <= 11; x++) hatRects.push(<rect key={`hh-${x}`} x={x} y={-1} width={1} height={1} fill="#ffd55a" />);
    }
  }

  return (
    <div
      className={clsx("pixelated select-none relative", PRESENCE_ANIM[presence])}
      style={{
        width: W * size,
        height: H * size,
        filter: ringColor ? `drop-shadow(0 0 ${size * 1.4}px ${ringColor}80)` : undefined,
      }}
      aria-hidden
    >
      <svg
        viewBox={`0 -1 ${W} ${H + 1}`}
        width={W * size}
        height={(H + 1) * size}
        shapeRendering="crispEdges"
        style={{ position: "absolute", left: 0, top: -size }}
      >
        {/* soft shadow on the floor */}
        <ellipse cx={W / 2} cy={H - 0.2} rx={W / 3.5} ry={1} fill="#000" opacity={0.45} />
        {bodyRects}
        {faceRects}
        {hatRects}
      </svg>
    </div>
  );
}
