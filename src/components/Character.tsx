import clsx from "clsx";
import type { BodyType, CreatureKind, Outfit, OutfitStyle, Presence } from "@/types/world";
import { darken, lighten } from "@/lib/color";

// ─── grid ──────────────────────────────────────────────────────────────
//   24 wide × 39 tall
//   y 0..13   head region (hair + hat + face)
//   y 14..38  body region (25 rows)

const GRID_W = 24;
const GRID_H = 39;
const FACE_X = 5;
const FACE_Y = 3;
const FACE_W = 14;
const FACE_H = 11;
const BODY_Y = 14;

// ─── body sprites by style ─────────────────────────────────────────────
//   region letters:
//     . transparent     S skin    C shirt   c shirt-shadow   H shirt-highlight
//     W white (suit shirt)        T tie/chain/accent
//     K pocket (slightly darker shirt — uses shirtShadow at render)
//     P pants   p pants-shadow    Z shoes   z shoes-shadow

const BODY_CASUAL: string[] = [
  "........SSSSSSSS........",
  "........SSSSSSSS........",
  "......CCCCCCCCCCCC......",
  ".....cCCCCHCCCHCCCCc....",
  ".....cCCCCCCCCCCCCc.....",
  ".....cCCCCCCCCCCCCc.....",
  ".....cCCCCCCCCCCCCc.....",
  ".....cCCCCCCCCCCCCc.....",
  ".....cCCCCCCCCCCCCc.....",
  "....SSCCCCCCCCCCCCSS....",
  "....SSCCCCCCCCCCCCSS....",
  ".....cCCCCCCCCCCCCc.....",
  "......pPPPPPPPPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  ".....zZZZZZZ.ZZZZZZz....",
  "....zZZZZZZZ.ZZZZZZZz...",
  "....ZZZZZZZZ.ZZZZZZZZ...",
];

// fem-casual — narrower shoulders, slight waist taper
const BODY_CASUAL_FEM: string[] = [
  "........SSSSSSSS........",
  "........SSSSSSSS........",
  ".......CCCCCCCCCC.......",
  "......cCCCCHCHCCCCc.....",
  "......cCCCCCCCCCCCc.....",
  ".......cCCCCCCCCCc......",
  ".......cCCCCCCCCCc......",
  ".......cCCCCCCCCCc......",
  "......cCCCCCCCCCCCc.....",
  "....SSCCCCCCCCCCCCSS....",
  "....SSCCCCCCCCCCCCSS....",
  ".....cCCCCCCCCCCCCc.....",
  "......pPPPPPPPPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  ".....zZZZZZZ.ZZZZZZz....",
  "....zZZZZZZZ.ZZZZZZZz...",
  "....ZZZZZZZZ.ZZZZZZZZ...",
];

// suit — V-neck with white shirt and tie, slacks, dress shoes
const BODY_SUIT: string[] = [
  "........SSSSSSSS........",
  "......CCWWWWWWWWCC......",
  ".....cCCWWWTTWWWCCc.....",
  ".....cCCCWTTTTWCCCc.....",
  ".....cCCCCTTTTCCCCc.....",
  ".....cCCCCCTTTCCCCCc....",
  ".....cCCCCCTTTCCCCCc....",
  ".....cCCCCCCTCCCCCCc....",
  ".....cCCCCCCCCCCCCc.....",
  "....SSCCCCCCCCCCCCSS....",
  "....SSCCCCCCCCCCCCSS....",
  ".....cCCCCCCCCCCCCc.....",
  "......pPPPPPPPPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  "......pPPPP..PPPPp......",
  ".....zZZZZZ...ZZZZZz....",
  "....zZZZZZZ...ZZZZZZz...",
  "....ZZZZZZZ...ZZZZZZZ...",
];

// hiphop — oversized hoodie with pocket + chain, baggy pants, chunky sneakers
const BODY_HIPHOP: string[] = [
  "........SSSSSSSS........",
  ".......TTTTTTTTTT.......",
  "...CCCCCCCCCCCCCCCCCC...",
  "..cCCCCCCCCCCCCCCCCCCc..",
  "..cCCCCCCCCCCCCCCCCCCc..",
  "..cCCCCCCKKKKKKCCCCCCc..",
  "..cCCCCCKKKKKKKKCCCCCc..",
  "..cCCCCCCKKKKKKCCCCCCc..",
  "..cCCCCCCCCCCCCCCCCCCc..",
  ".SSCCCCCCCCCCCCCCCCCCSS.",
  ".SSCCCCCCCCCCCCCCCCCCSS.",
  "..cCCCCCCCCCCCCCCCCCCc..",
  "....pPPPPPPPPPPPPPPpp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "...pPPPPPP....PPPPPPp...",
  "..zZZZZZZZZ..ZZZZZZZZz..",
  ".zZZZZZZZZZZ.ZZZZZZZZZz.",
  ".ZZZZZZZZZZZ.ZZZZZZZZZZ.",
];

// dress — flowing skirt instead of leg split (fem)
const BODY_DRESS: string[] = [
  "........SSSSSSSS........",
  "........SSSSSSSS........",
  ".......CCCCCCCCCC.......",
  "......cCCCCWCWCCCCc.....",
  "......cCCCCCCCCCCCc.....",
  ".......cCCCCCCCCCc......",
  ".......cCCCCCCCCCc......",
  "......cCCCCCCCCCCCc.....",
  "......cCCCCCCCCCCCc.....",
  "....SSCCCCCCCCCCCCSS....",
  "....SSCCCCCCCCCCCCSS....",
  ".....cCCCCCCCCCCCCc.....",
  ".....cCCCCCCCCCCCCc.....",
  "....pCCCCCCCCCCCCCCp....",
  "....pCCCCCCCCCCCCCCp....",
  "...pCCCCCCCCCCCCCCCCp...",
  "...pCCCCCCCCCCCCCCCCp...",
  "..pCCCCCCCCCCCCCCCCCCp..",
  "..pCCCCCCCCCCCCCCCCCCp..",
  "..pCCCCCCCCCCCCCCCCCCp..",
  "..pCCCCCCCCCCCCCCCCCCp..",
  ".pCCCCCCCCCCCCCCCCCCCCp.",
  "........................",
  ".........ZZZ.ZZZ........",
  ".........ZZZ.ZZZ........",
];

const BODY_SPRITES: Record<string, string[]> = {
  "masc-casual": BODY_CASUAL,
  "fem-casual": BODY_CASUAL_FEM,
  "masc-suit": BODY_SUIT,
  "fem-suit": BODY_SUIT, // shared base for now
  "masc-hiphop": BODY_HIPHOP,
  "fem-hiphop": BODY_HIPHOP,
  "masc-dress": BODY_CASUAL, // dress not for masc — fallback
  "fem-dress": BODY_DRESS,
};

// ─── hair ──────────────────────────────────────────────────────────────
//   h hair main    H hair highlight
const HAIR_MASC: string[] = [
  "........hhhhhhhh........",
  "......hhhhHHHHhhhhh.....",
  "......hhhhhhhhhhhh......",
  "......hh........hh......",
  // rest empty (face area)
];

const HAIR_FEM: string[] = [
  "......hhhhhhhhhhhh......",
  ".....hhhhhHHHHhhhhhh....",
  "....hhhhhhhhhhhhhhhh....",
  "....hh............hh....",
  "....hh............hh....",
  "....hh............hh....",
  "....hh............hh....",
  "....hh............hh....",
  "....hh............hh....",
  "....hh............hh....",
  "....hh............hh....",
  "....hh............hh....",
  "...hhh............hhh...",
  "...hhh............hhh...",
];

const HAIR: Record<BodyType, string[]> = {
  masc: HAIR_MASC,
  fem: HAIR_FEM,
};

// ─── creature faces ────────────────────────────────────────────────────
interface FaceDef {
  main: string;
  accent: string;
  eye: string;
  shape: string[];
}

const FACES: Record<CreatureKind, FaceDef> = {
  cozy_spirit: {
    main: "#f4c98a",
    accent: "#f37a7a",
    eye: "#2a1810",
    shape: [
      "...11111111...",
      "..1112211111..",
      ".112221111111.",
      ".112221111113.",
      "11122211111113",
      "11d11111111d13",
      "11111111111113",
      "11111111111133",
      ".11A11111A1133",
      "..1111111111..",
      "....111111....",
    ],
  },
  glitch_robot: {
    main: "#7af0ff",
    accent: "#ff5ec4",
    eye: "#08222a",
    shape: [
      "..1111111111..",
      ".111111111111.",
      "11111111111111",
      "1ddd111111ddd1",
      "1ddd111111ddd1",
      "11d11111111d11",
      "11d11d11d11d11",
      "11d11111111d11",
      "1dddddddddddd1",
      ".11dddddddd11.",
      "..1111111111..",
    ],
  },
  floating_ghost: {
    main: "#dfe5ff",
    accent: "#9ab0ff",
    eye: "#1c2440",
    shape: [
      "...11111111...",
      "..1111111111..",
      ".111111111111.",
      "1112111111121.",
      "11d11111111d11",
      "11d11111111d13",
      "11111111111113",
      "11A111111111A1",
      "1.1.1.1.1.1.1.",
      "..............",
      "..............",
    ],
  },
  sleepy_blob: {
    main: "#9ad3a8",
    accent: "#f3a3a3",
    eye: "#152418",
    shape: [
      "..............",
      "...11111111...",
      "..1112211111..",
      ".111122111113.",
      ".111122111133.",
      "11AddA11AddA13",
      "11111111111113",
      ".11111111111.",
      "..1111111133..",
      "....111111....",
      "..............",
    ],
  },
  tiny_monster: {
    main: "#ff7ab6",
    accent: "#7af0ff",
    eye: "#3a0e22",
    shape: [
      "d............d",
      "d1..........1d",
      "d111......111d",
      ".11111111111..",
      ".11d111111d11.",
      ".11111111111..",
      ".1ddd1111ddd1.",
      ".11111111111..",
      "..A11A11A11A..",
      "...11111111...",
      "..............",
    ],
  },
};

// ─── hats ──────────────────────────────────────────────────────────────
const HATS: Record<"cap" | "beanie" | "hood", string[]> = {
  beanie: [
    ".......hhhhhhhhhh.......",
    "......hhhhhhhhhhhh......",
    "......hhhhhhhhhhhh......",
  ],
  cap: [
    "......hhhhhhhhhhhh......",
    ".....hhhhhhhhhhhhhh.....",
    "....hhhhhhhhhhhhhhhhh...",
  ],
  hood: [
    "...hhhhhhhhhhhhhhhh.....",
    "..hhhhhhhhhhhhhhhhhh....",
    "..hh................hh..",
  ],
};

// ─── presence ──────────────────────────────────────────────────────────
const PRESENCE_ANIM: Record<Presence, string> = {
  active: "animate-idle",
  lurking: "animate-breathe opacity-65",
  idle: "animate-breathe",
  away: "opacity-30",
};

const SKIN = "#f0c8a0";

// ─── helpers ───────────────────────────────────────────────────────────
type ColorMap = {
  shirt: string;
  shirtShadow: string;
  shirtHighlight: string;
  pants: string;
  pantsShadow: string;
  shoes: string;
  shoesShadow: string;
  accent: string;
};

function bodyFill(ch: string, c: ColorMap): string | null {
  switch (ch) {
    case "S": return SKIN;
    case "C": return c.shirt;
    case "c": return c.shirtShadow;
    case "H": return c.shirtHighlight;
    case "K": return c.shirtShadow;
    case "W": return "#f4f4f8";
    case "T": return c.accent;
    case "P": return c.pants;
    case "p": return c.pantsShadow;
    case "Z": return c.shoes;
    case "z": return c.shoesShadow;
    default: return null;
  }
}

function faceFill(ch: string, def: FaceDef, fHi: string, fSh: string): string | null {
  switch (ch) {
    case "1": return def.main;
    case "2": return fHi;
    case "3": return fSh;
    case "d": return def.eye;
    case "A": return def.accent;
    default: return null;
  }
}

function hairFill(ch: string, mid: string, hi: string): string | null {
  if (ch === "h") return mid;
  if (ch === "H") return hi;
  return null;
}

// ─── full character ────────────────────────────────────────────────────

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
  const bodyType: BodyType = outfit.bodyType ?? "masc";
  const style: OutfitStyle = outfit.style ?? "casual";
  const shirt = outfit.shirt;
  const pants = outfit.pants;
  const shoes = outfit.shoes ?? "#1a1620";
  const accent = outfit.accent ?? "#1a1a26";
  const hairColor = outfit.hair;

  const colors: ColorMap = {
    shirt,
    shirtShadow: darken(shirt, 0.32),
    shirtHighlight: lighten(shirt, 0.18),
    pants,
    pantsShadow: darken(pants, 0.32),
    shoes,
    shoesShadow: darken(shoes, 0.35),
    accent,
  };

  const cells: React.ReactNode[] = [];

  // body sprite
  const bodySprite = BODY_SPRITES[`${bodyType}-${style}`] ?? BODY_CASUAL;
  bodySprite.forEach((row, dy) => {
    const y = BODY_Y + dy;
    for (let x = 0; x < row.length; x++) {
      const fill = bodyFill(row[x], colors);
      if (fill) cells.push(<rect key={`b${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  });

  // hair (skip if hood hat is worn)
  if (hairColor && outfit.hat?.kind !== "hood") {
    const hairHi = lighten(hairColor, 0.2);
    const hairSprite = HAIR[bodyType];
    hairSprite.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const fill = hairFill(row[x], hairColor, hairHi);
        if (fill) cells.push(<rect key={`hr${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
      }
    });
  }

  // face
  const def = FACES[kind];
  const fHi = lighten(def.main, 0.22);
  const fSh = darken(def.main, 0.28);
  def.shape.forEach((row, dy) => {
    const y = FACE_Y + dy;
    for (let x = 0; x < row.length; x++) {
      const fill = faceFill(row[x], def, fHi, fSh);
      if (fill) cells.push(<rect key={`f${x + FACE_X}-${y}`} x={x + FACE_X} y={y} width={1} height={1} fill={fill} />);
    }
  });

  // hat
  if (outfit.hat && outfit.hat.kind !== "none") {
    const hatColor = outfit.hat.color ?? "#202028";
    const hatShadow = darken(hatColor, 0.3);
    if (outfit.hat.kind === "halo") {
      for (let x = 7; x <= 16; x++) {
        if (x === 11 || x === 12) continue;
        cells.push(<rect key={`hh${x}`} x={x} y={1} width={1} height={1} fill="#ffd55a" />);
      }
    } else {
      const sprite = HATS[outfit.hat.kind as "cap" | "beanie" | "hood"];
      if (sprite) {
        sprite.forEach((row, dy) => {
          for (let x = 0; x < row.length; x++) {
            if (row[x] !== "h") continue;
            const isBottomRight = dy === 2 && x > GRID_W / 2;
            cells.push(<rect key={`h${x}-${dy}`} x={x} y={dy} width={1} height={1} fill={isBottomRight ? hatShadow : hatColor} />);
          }
        });
      }
    }
  }

  return (
    <div
      className={clsx("pixelated select-none", PRESENCE_ANIM[presence])}
      style={{
        width: GRID_W * size,
        height: GRID_H * size,
        filter: ringColor ? `drop-shadow(0 0 ${size * 2}px ${ringColor}90)` : undefined,
      }}
      aria-hidden
    >
      <svg
        viewBox={`-1 -1 ${GRID_W + 2} ${GRID_H + 2}`}
        width={(GRID_W + 2) * size}
        height={(GRID_H + 2) * size}
        shapeRendering="crispEdges"
        style={{ marginLeft: -size, marginTop: -size, display: "block" }}
      >
        <ellipse cx={GRID_W / 2} cy={GRID_H - 0.2} rx={GRID_W / 3.2} ry={1.1} fill="#000" opacity={0.5} />
        {cells}
      </svg>
    </div>
  );
}

// ─── face-only renderer ─────────────────────────────────────────────────
export function CreatureFace({ kind, size = 4 }: { kind: CreatureKind; size?: number }) {
  const def = FACES[kind];
  const fHi = lighten(def.main, 0.22);
  const fSh = darken(def.main, 0.28);
  const cells: React.ReactNode[] = [];
  def.shape.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = faceFill(row[x], def, fHi, fSh);
      if (fill) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  });
  return (
    <svg
      viewBox={`0 0 ${FACE_W} ${FACE_H}`}
      width={FACE_W * size}
      height={FACE_H * size}
      shapeRendering="crispEdges"
      className="pixelated block"
    >
      {cells}
    </svg>
  );
}
