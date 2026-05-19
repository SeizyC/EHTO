import clsx from "clsx";
import type { ReactNode } from "react";
import type { BodyType, CreatureKind, Outfit, OutfitStyle, Presence } from "@/types/world";
import { darken, lighten } from "@/lib/color";

// ─── grid ──────────────────────────────────────────────────────────────
const GRID_W = 32;
const GRID_H = 56;

// ─── reference sprite ──────────────────────────────────────────────────
//   32 wide × 56 tall.  Pose: 3/4 iso view, both feet point lower-right.
//   Letter palette:
//     . transparent
//     H hat main         h hat shadow      (e.g. beanie)
//     R hat highlight    (cap brim etc.)
//     B hair             b hair shadow
//     S skin             s skin shadow
//     e eye              E eyebrow / sunglasses
//     M mask / mouthwear m mask shadow
//     N neck shadow
//     C shirt main       c shirt shadow
//     L collar fold      W white shirt (V-neck for suit)
//     T accent (chain / tie / drawstring / stripe)
//     G gem / pendant (blue)
//     K pocket (slightly darker shirt)
//     P pants main       p pants shadow
//     F pant cuff fold
//     Z shoes main       z shoes shadow    Y sole highlight

const SPRITE: string[] = [
  /* 00 */ "............HHHHHHHH............",
  /* 01 */ "..........HHHHHHHHHHHH..........",
  /* 02 */ ".........HHHHHHHHHHHHHH.........",
  /* 03 */ "........HHHHHHHHHHHHHHHH........",
  /* 04 */ "........HHHHHHHHHHHHHHHH........",
  /* 05 */ "........HHHHHHHHHHHHHHHh........",
  /* 06 */ "........HHHHHHHHHHHHHHhh........",
  /* 07 */ "........HHHHHHHHHHHHHhhh........",
  /* 08 */ "........hhhhhhhhhhhhhhhh........",
  /* 09 */ ".........BBSSSSSSSSSSBB.........",
  /* 10 */ ".........BSSSSSSSSSSSSB.........",
  /* 11 */ ".........SSSeeSSSSeeSSS.........",
  /* 12 */ ".........SSSeeSSSSeeSSS.........",
  /* 13 */ ".........SSSSSSSSSSSSSS.........",
  /* 14 */ "..........SSSSSSSSSSSS..........",
  /* 15 */ "..........MMMMMMMMMMMM..........",
  /* 16 */ "..........MMMMMMMMMMMM..........",
  /* 17 */ "..........MMMMMMMMMMMM..........",
  /* 18 */ "...........mmmmmmmmmm...........",
  /* 19 */ "............SSSSSSSS............",
  /* 20 */ "............NNNNNNNN............",
  /* 21 */ "........TTTTTTTTTTTTTTTT........",
  /* 22 */ "..............GGGG..............",
  /* 23 */ ".......CCCCCCCCCCCCCCCCCC.......",
  /* 24 */ "......cCCCCCCCCCCCCCCCCCCc......",
  /* 25 */ "......cCCCCCCCCCCCCCCCCCCc......",
  /* 26 */ "......cCCCCCCCCCCCCCCCCCCc......",
  /* 27 */ "......cCCCCCCCCCCCCCCCCCCc......",
  /* 28 */ "......cCCCCCCKKKKKCCCCCCCc......",
  /* 29 */ "......cCCCCCKKKKKKKCCCCCCc......",
  /* 30 */ "......cCCCCCCKKKKKCCCCCCCc......",
  /* 31 */ "......cCCCCCCCCCCCCCCCCCCc......",
  /* 32 */ ".....SSCCCCCCCCCCCCCCCCCCSS.....",
  /* 33 */ ".....SSCCCCCCCCCCCCCCCCCCSS.....",
  /* 34 */ "......cCCCCCCCCCCCCCCCCCCc......",
  /* 35 */ "......cCCCCCCCCCCCCCCCCCCc......",
  /* 36 */ ".......cCCCCCCCCCCCCCCCCc.......",
  /* 37 */ "........PPPPPPPPPPPPPPPP........",
  /* 38 */ "........PPPPPP....PPPPPP........",
  /* 39 */ "........PPPPPP....PPPPPP........",
  /* 40 */ "........PPPPPP....PPPPPP........",
  /* 41 */ "........PPPPPP....PPPPPP........",
  /* 42 */ "........PPPPPP....PPPPPP........",
  /* 43 */ "........PPPPPP....PPPPPP........",
  /* 44 */ "........PPPPPP....PPPPPP........",
  /* 45 */ "........PPPPPP....PPPPPP........",
  /* 46 */ "........PPPPPP....PPPPPP........",
  /* 47 */ "........PPPPPP....PPPPPP........",
  /* 48 */ "........PPPPPP....PPPPPP........",
  /* 49 */ "........pPPPPP....PPPPPp........",
  /* 50 */ "........FPPPPP....PPPPPF........",
  /* 51 */ ".......ZZZZZ....................",
  /* 52 */ "........ZZZZZ...ZZZZZ...........",
  /* 53 */ ".........YYYYY..ZZZZZ...........",
  /* 54 */ "..................YYYYY.........",
  /* 55 */ "................................",
];

// ─── palette resolution ────────────────────────────────────────────────
interface Palette {
  hat: string;
  hatShadow: string;
  hatHilite: string;
  hair: string;
  hairShadow: string;
  skin: string;
  skinShadow: string;
  eye: string;
  mask: string;
  maskShadow: string;
  neck: string;
  shirt: string;
  shirtShadow: string;
  shirtHilite: string;
  shirtDeep: string;
  white: string;
  accent: string;
  gem: string;
  pants: string;
  pantsShadow: string;
  pantsDeep: string;
  shoes: string;
  shoesShadow: string;
  shoesHi: string;
}

const SKIN_TONES: Record<string, string> = {
  porcelain: "#f9d9b9",
  fair: "#f0c8a0",
  warm: "#d99463",
  tan: "#b4744a",
  deep: "#75462a",
};

function buildPalette(outfit: Outfit, kind: CreatureKind): Palette {
  const skinName = PRESETS[kind]?.skin ?? "fair";
  const skin = SKIN_TONES[skinName] ?? SKIN_TONES.fair;
  const hair = outfit.hair ?? "#1a1208";
  const shirt = outfit.shirt;
  const pants = outfit.pants;
  const shoes = outfit.shoes ?? "#b8b8c0";
  const hatColor = outfit.hat?.color ?? "#2a2a30";
  const accent = outfit.accent ?? "#d4a83a";
  return {
    hat: hatColor,
    hatShadow: darken(hatColor, 0.35),
    hatHilite: lighten(hatColor, 0.2),
    hair,
    hairShadow: darken(hair, 0.35),
    skin,
    skinShadow: darken(skin, 0.22),
    eye: "#1a0d05",
    mask: PRESETS[kind]?.maskColor ?? "#a8d8c4",
    maskShadow: darken(PRESETS[kind]?.maskColor ?? "#a8d8c4", 0.28),
    neck: darken(skin, 0.35),
    shirt,
    shirtShadow: darken(shirt, 0.34),
    shirtHilite: lighten(shirt, 0.2),
    shirtDeep: darken(shirt, 0.55),
    white: "#f4f4f8",
    accent,
    gem: "#6aa0d8",
    pants,
    pantsShadow: darken(pants, 0.32),
    pantsDeep: darken(pants, 0.55),
    shoes,
    shoesShadow: darken(shoes, 0.42),
    shoesHi: lighten(shoes, 0.3),
  };
}

// ─── face presets ──────────────────────────────────────────────────────
interface FacePreset {
  skin: string;
  hatKind?: Outfit["hat"];
  showMask?: boolean;
  maskColor?: string;
  showChain?: boolean;
}

const PRESETS: Record<CreatureKind, FacePreset> = {
  cheerful: { skin: "fair", showChain: false, showMask: false },
  cool: { skin: "warm", showMask: true, maskColor: "#1a1a26", showChain: true },
  shy: { skin: "porcelain", showMask: false, showChain: false },
  sleepy: { skin: "fair", showMask: false, showChain: false },
  geek: { skin: "fair", showMask: false, showChain: false },
  playful: { skin: "tan", showMask: false, showChain: true },
  soft: { skin: "porcelain", showMask: false, showChain: false },
  mysterious: { skin: "deep", showMask: true, maskColor: "#a8d8c4", showChain: true },
};

// ─── letter → color map ────────────────────────────────────────────────
function colorFor(ch: string, p: Palette, showMask: boolean, showChain: boolean, showHat: boolean): string | null {
  switch (ch) {
    case "H": return showHat ? p.hat : p.hair;
    case "h": return showHat ? p.hatShadow : p.hairShadow;
    case "R": return p.hatHilite;
    case "B": return p.hair;
    case "b": return p.hairShadow;
    case "S": return p.skin;
    case "s": return p.skinShadow;
    case "e": return p.eye;
    case "E": return p.shirtDeep;
    case "M": return showMask ? p.mask : p.skin;
    case "m": return showMask ? p.maskShadow : p.skinShadow;
    case "N": return p.neck;
    case "C": return p.shirt;
    case "c": return p.shirtShadow;
    case "L": return p.shirtDeep;
    case "W": return p.white;
    case "T": return showChain ? p.accent : null;
    case "G": return showChain ? p.gem : null;
    case "K": return p.shirtShadow;
    case "P": return p.pants;
    case "p": return p.pantsShadow;
    case "F": return p.pantsDeep;
    case "Z": return p.shoes;
    case "z": return p.shoesShadow;
    case "Y": return p.shoesHi;
    default: return null;
  }
}

const PRESENCE_ANIM: Record<Presence, string> = {
  active: "animate-idle",
  lurking: "animate-breathe opacity-65",
  idle: "animate-breathe",
  away: "opacity-30",
};

// ─── component ─────────────────────────────────────────────────────────
export function Character({
  kind,
  presence,
  outfit,
  size = 4,
  ringColor,
}: {
  kind: CreatureKind;
  presence: Presence;
  outfit: Outfit;
  size?: number;
  ringColor?: string;
}) {
  const preset = PRESETS[kind] ?? PRESETS.cheerful;
  const palette = buildPalette(outfit, kind);
  const showMask = !!preset.showMask;
  const showChain = !!preset.showChain;
  const showHat = !!(outfit.hat && outfit.hat.kind !== "none");

  const cells: ReactNode[] = [];
  SPRITE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = colorFor(row[x], palette, showMask, showChain, showHat);
      if (fill) cells.push(<rect key={`p${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  });

  return (
    <div
      className={clsx("pixelated select-none relative", PRESENCE_ANIM[presence])}
      style={{
        width: GRID_W * size,
        height: GRID_H * size,
        filter: ringColor ? `drop-shadow(0 0 ${size * 2}px ${ringColor}90)` : undefined,
      }}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${GRID_W} ${GRID_H}`}
        width={GRID_W * size}
        height={GRID_H * size}
        shapeRendering="crispEdges"
        style={{ display: "block" }}
      >
        <ellipse cx={GRID_W / 2} cy={GRID_H - 0.5} rx={8} ry={1.2} fill="#000" opacity={0.45} />
        {cells}
      </svg>
    </div>
  );
}

// ─── face-only thumbnail (head crop) ───────────────────────────────────
export function CreatureFace({ kind, size = 4 }: { kind: CreatureKind; size?: number }) {
  const preset = PRESETS[kind] ?? PRESETS.cheerful;
  const palette = buildPalette({ shirt: "#2a4ac8", pants: "#000", hat: { kind: "beanie", color: "#2a2a30" } }, kind);
  const showMask = !!preset.showMask;
  const cells: ReactNode[] = [];
  // crop rows 0..20
  for (let y = 0; y <= 20; y++) {
    const row = SPRITE[y];
    for (let x = 0; x < row.length; x++) {
      const fill = colorFor(row[x], palette, showMask, false, true);
      if (fill) cells.push(<rect key={`p${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  }
  // Crop to face area
  return (
    <svg
      viewBox={`8 0 16 21`}
      width={16 * size}
      height={21 * size}
      shapeRendering="crispEdges"
      className="pixelated block"
    >
      {cells}
    </svg>
  );
}

// Kept for future use — bodyType / style currently unused (single sprite).
export type _UnusedBT = BodyType;
export type _UnusedOS = OutfitStyle;
