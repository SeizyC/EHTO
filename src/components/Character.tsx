import clsx from "clsx";
import type { ReactNode } from "react";
import type { BodyType, CreatureKind, Outfit, OutfitStyle, Presence } from "@/types/world";
import { darken, lighten } from "@/lib/color";
import {
  ellipseCells,
  lineCells,
  rectCells,
  renderCells,
  shadedEllipse,
  trapezoidCells,
} from "./pixelDraw";

// ─── high-res procedural grid ──────────────────────────────────────────
//   Logical pixels: 32 wide × 56 tall.
//   Anatomical anchor points (column 16 is body axis; 3/4 stance shifts slightly):
//
//     y 0..21    head (hair + face)
//     y 22..36   torso
//     y 37..43   hips / waist / skirt or belt
//     y 44..52   legs
//     y 53..55   feet
//
//   3/4 stance: feet & shoulders asymmetric — left side closer (front), right
//   side farther (back). Front side is drawn at slight offset, with rim shade
//   on the right edges.

const GRID_W = 32;
const GRID_H = 56;

// ─── palette helpers ───────────────────────────────────────────────────
const SKIN_TONES = {
  default: "#f3c89e",
  warm: "#d99463",
  tan: "#b4744a",
};
const SKIN_SHADOW = "#9a6840";
const SKIN_HILITE = "#ffe4c4";

interface ResolvedPalette {
  skin: string;
  skinShadow: string;
  skinHilite: string;
  hair: string;
  hairShadow: string;
  hairHilite: string;
  top: string;
  topShadow: string;
  topHilite: string;
  bottom: string;
  bottomShadow: string;
  bottomHilite: string;
  shoes: string;
  shoesShadow: string;
  accent: string;
}

function resolvePalette(outfit: Outfit, skinTone: keyof typeof SKIN_TONES = "default"): ResolvedPalette {
  const skin = SKIN_TONES[skinTone];
  const top = outfit.shirt;
  const bottom = outfit.pants;
  const hair = outfit.hair ?? "#2a1810";
  const shoes = outfit.shoes ?? "#1a1620";
  return {
    skin,
    skinShadow: darken(skin, 0.28),
    skinHilite: lighten(skin, 0.18),
    hair,
    hairShadow: darken(hair, 0.4),
    hairHilite: lighten(hair, 0.25),
    top,
    topShadow: darken(top, 0.32),
    topHilite: lighten(top, 0.22),
    bottom,
    bottomShadow: darken(bottom, 0.34),
    bottomHilite: lighten(bottom, 0.18),
    shoes,
    shoesShadow: darken(shoes, 0.4),
    accent: outfit.accent ?? "#1a1a26",
  };
}

// ─── face data ─────────────────────────────────────────────────────────
//   Eyes & mouth are positioned within the head ellipse.
//   Each creature has: skin override, eye style, mouth style.

interface FaceDef {
  skin: keyof typeof SKIN_TONES;
  hairColor?: string; // some creatures override hair (none = use outfit.hair)
  eyeStyle: "round" | "led" | "closed" | "horn" | "dashes" | "shy" | "cat" | "shut";
  eyeColor: string;
  accent: string; // cheek blush / mouth
  hornStyle?: "horns" | "ears" | "cat" | "none";
  cuteness: number; // 0..1, multiplier for eye size
}

const FACES: Record<CreatureKind, FaceDef> = {
  cozy_spirit: { skin: "warm", eyeStyle: "round", eyeColor: "#2a1810", accent: "#f37a7a", cuteness: 0.85 },
  glitch_robot: { skin: "default", eyeStyle: "led", eyeColor: "#08222a", accent: "#7af0ff", cuteness: 0.6 },
  floating_ghost: { skin: "default", eyeStyle: "shut", eyeColor: "#1c2440", accent: "#9ab0ff", cuteness: 0.75 },
  sleepy_blob: { skin: "default", eyeStyle: "closed", eyeColor: "#152418", accent: "#f3a3a3", cuteness: 0.7 },
  tiny_monster: { skin: "default", eyeStyle: "round", eyeColor: "#3a0e22", accent: "#7af0ff", hornStyle: "horns", cuteness: 0.95 },
  shy_bunny: { skin: "default", eyeStyle: "shy", eyeColor: "#2a0e0e", accent: "#ff9aa2", hornStyle: "ears", cuteness: 1.0 },
  pixie_cat: { skin: "tan", eyeStyle: "cat", eyeColor: "#1a0a0a", accent: "#f3c97a", hornStyle: "cat", cuteness: 0.9 },
  mochi_blob: { skin: "default", eyeStyle: "closed", eyeColor: "#3a1a26", accent: "#ffb8c8", cuteness: 0.8 },
};

// ─── hair styles (silhouette envelopes around the head) ────────────────
// Hair is drawn behind the head, then face features overlay.
type HairStyle = "short" | "bob" | "long" | "spike" | "tied";

function pickHair(bodyType: BodyType, style: OutfitStyle): HairStyle {
  if (bodyType === "fem") {
    if (style === "athletic") return "tied";
    if (style === "hiphop") return "long";
    return "bob";
  }
  if (style === "hiphop") return "spike";
  if (style === "suit") return "short";
  return "short";
}

// ─── 3/4 stance helpers ────────────────────────────────────────────────
// Character is angled so we see the front-right of the body more (3/4 view
// facing slightly to viewer's left). On screen:
//   * Head: face features shifted +1 col left (looking left)
//   * Shoulders: left shoulder higher, right shoulder narrower
//   * Hips: left hip slightly forward
//   * Feet: LEFT foot forward+lower, RIGHT foot back+higher

const AXIS = 16; // body center column

// ─── HAIR drawing ──────────────────────────────────────────────────────
function drawHair(p: ResolvedPalette, hairStyle: HairStyle, headCx: number, headCy: number, headRx: number, headRy: number): ReactNode[] {
  // Hair envelope around the head.
  const cells: Array<{ x: number; y: number }> = [];
  if (hairStyle === "short") {
    // Cap shape — top half of head plus side burns.
    cells.push(...ellipseCells(headCx, headCy - 1, headRx + 1, headRy));
    // Cut off the bottom (face stays visible)
    return cells
      .filter((c) => c.y <= headCy - 1)
      .map((c, i) => <rect key={`hr-${i}`} x={c.x} y={c.y} width={1} height={1} fill={p.hair} />);
  }
  if (hairStyle === "bob") {
    // Wider, falls to shoulders. Two layers — back (full ellipse) + front bangs.
    const back = ellipseCells(headCx, headCy + 2, headRx + 2, headRy + 4);
    // Crop so it doesn't cover full face — exclude central face area cols
    const filtered = back.filter((c) => {
      // keep all hair pixels except a "face window" front-and-center
      const inFace = c.y >= headCy - 1 && c.y <= headCy + headRy - 2 && c.x >= headCx - headRx + 2 && c.x <= headCx + headRx - 4;
      return !inFace;
    });
    return filtered.map((c, i) => <rect key={`hr-${i}`} x={c.x} y={c.y} width={1} height={1} fill={p.hair} />);
  }
  if (hairStyle === "long") {
    // Bob but longer down to chest. Add side strands.
    const top = ellipseCells(headCx, headCy + 1, headRx + 2, headRy + 3);
    const sideL = rectCells(headCx - headRx - 1, headCy + 2, headCx - headRx, headCy + headRy + 8);
    const sideR = rectCells(headCx + headRx, headCy + 2, headCx + headRx + 1, headCy + headRy + 8);
    const all = [...top, ...sideL, ...sideR].filter((c) => {
      const inFace = c.y >= headCy - 1 && c.y <= headCy + headRy - 2 && c.x >= headCx - headRx + 2 && c.x <= headCx + headRx - 4;
      return !inFace;
    });
    return all.map((c, i) => <rect key={`hr-${i}`} x={c.x} y={c.y} width={1} height={1} fill={p.hair} />);
  }
  if (hairStyle === "spike") {
    // Spike up — irregular top shape.
    const base = ellipseCells(headCx, headCy, headRx + 1, headRy);
    const spikes = [
      ...rectCells(headCx - 4, headCy - headRy - 2, headCx - 2, headCy - headRy + 1),
      ...rectCells(headCx - 1, headCy - headRy - 3, headCx + 1, headCy - headRy + 1),
      ...rectCells(headCx + 2, headCy - headRy - 2, headCx + 4, headCy - headRy + 1),
    ];
    return [...base.filter((c) => c.y <= headCy), ...spikes].map((c, i) => (
      <rect key={`hr-${i}`} x={c.x} y={c.y} width={1} height={1} fill={p.hair} />
    ));
  }
  if (hairStyle === "tied") {
    // Ponytail — short top + ponytail behind on the right (3/4 view shows it).
    const top = ellipseCells(headCx, headCy - 1, headRx + 1, headRy).filter((c) => c.y <= headCy - 1);
    const tail = rectCells(headCx + headRx + 1, headCy, headCx + headRx + 3, headCy + headRy + 6);
    return [...top, ...tail].map((c, i) => (
      <rect key={`hr-${i}`} x={c.x} y={c.y} width={1} height={1} fill={p.hair} />
    ));
  }
  return cells.map((c, i) => <rect key={`hr-${i}`} x={c.x} y={c.y} width={1} height={1} fill={p.hair} />);
}

// ─── EYES / FACE features ──────────────────────────────────────────────
function drawFaceFeatures(p: ResolvedPalette, face: FaceDef, headCx: number, headCy: number, headRy: number): ReactNode[] {
  const cells: ReactNode[] = [];
  // Eyes are positioned slightly left of center (3/4 facing left).
  // 4 cols off-center: left eye at (headCx-4, headCy+1), right eye at (headCx+0, headCy+1)
  const leftEyeX = headCx - 3;
  const rightEyeX = headCx + 2;
  const eyeY = headCy + 1;

  if (face.eyeStyle === "round" || face.eyeStyle === "shy") {
    // Big round eye 2×2 with white shine
    for (const ex of [leftEyeX, rightEyeX]) {
      // pupil 2x2
      cells.push(<rect key={`eye-${ex}-1`} x={ex} y={eyeY} width={2} height={2} fill={face.eyeColor} />);
      // shine top-right
      cells.push(<rect key={`eye-${ex}-2`} x={ex + 1} y={eyeY} width={1} height={1} fill="#ffffff" />);
    }
  } else if (face.eyeStyle === "led") {
    // LED screens 3×2 with cross pattern
    for (const ex of [leftEyeX - 1, rightEyeX]) {
      cells.push(<rect key={`led-${ex}-bg`} x={ex} y={eyeY} width={3} height={2} fill={face.eyeColor} />);
      cells.push(<rect key={`led-${ex}-c`} x={ex + 1} y={eyeY} width={1} height={1} fill={face.accent} />);
    }
  } else if (face.eyeStyle === "closed" || face.eyeStyle === "dashes" || face.eyeStyle === "shut") {
    // Closed dash eyes (cute sleepy)
    for (const ex of [leftEyeX, rightEyeX]) {
      cells.push(<rect key={`eye-${ex}`} x={ex} y={eyeY + 1} width={2} height={1} fill={face.eyeColor} />);
    }
  } else if (face.eyeStyle === "cat") {
    // Cat eye — vertical pupil
    for (const ex of [leftEyeX, rightEyeX]) {
      cells.push(<rect key={`eye-${ex}-bg`} x={ex} y={eyeY} width={2} height={2} fill={face.eyeColor} />);
      cells.push(<rect key={`eye-${ex}-pup`} x={ex + 1} y={eyeY} width={0.6} height={2} fill={face.accent} />);
    }
  }

  // Mouth — small accent (varies by style)
  if (face.eyeStyle === "shy") {
    // Small smile
    cells.push(<rect key="mouth" x={headCx - 1} y={headCy + headRy - 3} width={3} height={1} fill={face.accent} />);
  } else if (face.eyeStyle === "closed") {
    // Tiny smile dots
    cells.push(<rect key="mouth" x={headCx - 1} y={headCy + headRy - 3} width={2} height={1} fill={face.accent} />);
  } else if (face.eyeStyle === "led") {
    // Speaker grill
    cells.push(<rect key="mouth-bg" x={headCx - 4} y={headCy + headRy - 4} width={8} height={2} fill={p.skinShadow} />);
    for (let x = -3; x <= 3; x += 2) {
      cells.push(<rect key={`mouth-g${x}`} x={headCx + x} y={headCy + headRy - 4} width={1} height={1} fill={face.accent} />);
    }
  } else if (face.eyeStyle === "round" || face.eyeStyle === "cat") {
    cells.push(<rect key="mouth" x={headCx - 1} y={headCy + headRy - 3} width={2} height={1} fill={face.accent} />);
  }

  // Cheek blush — small 2-pixel dots on both cheeks
  cells.push(<rect key="blush-l" x={headCx - 5} y={headCy + 3} width={2} height={1} fill={face.accent} opacity={0.55} />);
  cells.push(<rect key="blush-r" x={headCx + 3} y={headCy + 3} width={2} height={1} fill={face.accent} opacity={0.55} />);

  // Optional horns / ears
  if (face.hornStyle === "horns") {
    cells.push(<rect key="horn-l" x={headCx - 6} y={headCy - 7} width={1} height={2} fill={p.skinShadow} />);
    cells.push(<rect key="horn-r" x={headCx + 5} y={headCy - 7} width={1} height={2} fill={p.skinShadow} />);
  } else if (face.hornStyle === "ears") {
    cells.push(<rect key="ear-l" x={headCx - 5} y={headCy - 8} width={2} height={6} fill="#ffd5d5" />);
    cells.push(<rect key="ear-r" x={headCx + 3} y={headCy - 8} width={2} height={6} fill="#ffd5d5" />);
    cells.push(<rect key="ear-l-in" x={headCx - 4} y={headCy - 6} width={1} height={3} fill={face.accent} />);
    cells.push(<rect key="ear-r-in" x={headCx + 4} y={headCy - 6} width={1} height={3} fill={face.accent} />);
  } else if (face.hornStyle === "cat") {
    // triangular cat ears
    cells.push(<rect key="catl1" x={headCx - 6} y={headCy - 6} width={3} height={1} fill={p.hair} />);
    cells.push(<rect key="catl2" x={headCx - 5} y={headCy - 7} width={2} height={1} fill={p.hair} />);
    cells.push(<rect key="catl3" x={headCx - 4} y={headCy - 8} width={1} height={1} fill={p.hair} />);
    cells.push(<rect key="catr1" x={headCx + 3} y={headCy - 6} width={3} height={1} fill={p.hair} />);
    cells.push(<rect key="catr2" x={headCx + 3} y={headCy - 7} width={2} height={1} fill={p.hair} />);
    cells.push(<rect key="catr3" x={headCx + 3} y={headCy - 8} width={1} height={1} fill={p.hair} />);
  }

  return cells;
}

// ─── BODY: head + torso + arms + legs + feet, by (bodyType, style) ─────
function drawBody(p: ResolvedPalette, bodyType: BodyType, style: OutfitStyle, hat?: Outfit["hat"]): ReactNode[] {
  const cells: ReactNode[] = [];

  // ── proportions
  const headCy = 11;
  const headRx = bodyType === "fem" ? 6 : 7;
  const headRy = 7;

  // Body silhouette params
  const shoulderY = 22;
  const torsoBottomY = 36;
  const shoulderW = bodyType === "fem" ? 6 : 7; // half-width
  const waistW = bodyType === "fem" ? 5 : 6;
  const hipY = 41;
  const hipW = bodyType === "fem" ? 7 : 6;
  const legBottomY = 52;
  const legWidth = 3;

  // ── 3/4 stance offsets
  // Left side closer (foreground). Right side recessed by 1 px.
  const leftShoulderOffset = -1;
  const rightShoulderOffset = -1; // right shoulder pulled in (smaller)
  // ── Skin: face + arms + legs (drawn before clothing)

  // Head (skin ellipse)
  cells.push(...shadedEllipse(AXIS, headCy, headRx, headRy, p.skin, p.skinShadow, "head"));

  // Neck
  cells.push(...renderCells(rectCells(AXIS - 2, headCy + headRy - 1, AXIS + 2, shoulderY - 1), p.skin, "neck"));
  cells.push(...renderCells(rectCells(AXIS + 1, headCy + headRy - 1, AXIS + 2, shoulderY - 1), p.skinShadow, "neckShd"));

  // ── TORSO + ARMS (clothing fills it later)
  // Skin layer underneath (shoulders + arm strips + legs) - so bare-armed outfits show through
  const armCells = [
    ...rectCells(AXIS - shoulderW - 1, shoulderY + 1, AXIS - shoulderW, shoulderY + 11),
    ...rectCells(AXIS + shoulderW, shoulderY + 1, AXIS + shoulderW + 1, shoulderY + 11),
  ];
  cells.push(...renderCells(armCells, p.skin, "arms"));
  // Hands (3px pad at end of arms)
  cells.push(...renderCells(rectCells(AXIS - shoulderW - 2, shoulderY + 9, AXIS - shoulderW, shoulderY + 12), p.skin, "handL"));
  cells.push(...renderCells(rectCells(AXIS + shoulderW, shoulderY + 9, AXIS + shoulderW + 2, shoulderY + 12), p.skinShadow, "handR"));

  // Legs (skin underneath, hidden by pants/skirt)
  const legsBaseCells = [
    ...rectCells(AXIS - legWidth - 1, hipY + 1, AXIS - 1, legBottomY),
    ...rectCells(AXIS + 1, hipY + 1, AXIS + legWidth + 1, legBottomY),
  ];
  cells.push(...renderCells(legsBaseCells, p.skin, "legs"));

  // ── CLOTHING TOP per style
  if (style === "casual") {
    // T-shirt (round neck), short sleeves
    cells.push(
      ...renderCells(
        trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderW + leftShoulderOffset, AXIS + shoulderW + rightShoulderOffset, AXIS - waistW, AXIS + waistW),
        p.top,
        "top",
      ),
    );
    // Right side shading (rim shadow)
    cells.push(
      ...renderCells(
        rectCells(AXIS + waistW - 1, shoulderY + 1, AXIS + shoulderW + rightShoulderOffset, torsoBottomY),
        p.topShadow,
        "topShd",
      ),
    );
    // Short sleeves
    cells.push(...renderCells(rectCells(AXIS - shoulderW - 1, shoulderY, AXIS - shoulderW + 1, shoulderY + 4), p.top, "slvL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderW - 1, shoulderY, AXIS + shoulderW + 1, shoulderY + 4), p.topShadow, "slvR"));
    // Collar darker line
    cells.push(...renderCells(rectCells(AXIS - 3, shoulderY, AXIS + 3, shoulderY + 1), p.topShadow, "collar"));
  } else if (style === "suit") {
    // Jacket with V-lapel, white shirt, tie
    cells.push(
      ...renderCells(
        trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderW - 1, AXIS + shoulderW + 1, AXIS - waistW - 1, AXIS + waistW),
        p.top,
        "jacket",
      ),
    );
    // White V-shirt inside
    for (let y = shoulderY + 1; y <= shoulderY + 6; y++) {
      const w = Math.max(1, 4 - Math.floor((y - shoulderY) / 1.5));
      cells.push(...renderCells(rectCells(AXIS - w, y, AXIS + w, y), "#f4f4f8", `white${y}`));
    }
    // Tie
    cells.push(...renderCells(rectCells(AXIS - 1, shoulderY + 3, AXIS + 1, torsoBottomY - 2), p.accent, "tie"));
    cells.push(...renderCells(rectCells(AXIS - 1, shoulderY + 3, AXIS, shoulderY + 4), lighten(p.accent, 0.2), "tieHi"));
    // Lapel highlights
    cells.push(...renderCells(lineCells(AXIS - 4, shoulderY + 1, AXIS - 1, shoulderY + 6), p.topShadow, "lapelL"));
    cells.push(...renderCells(lineCells(AXIS + 4, shoulderY + 1, AXIS + 1, shoulderY + 6), p.topShadow, "lapelR"));
    // Sleeves long
    cells.push(...renderCells(rectCells(AXIS - shoulderW - 2, shoulderY + 1, AXIS - shoulderW, shoulderY + 11), p.top, "sleeveL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderW, shoulderY + 1, AXIS + shoulderW + 2, shoulderY + 11), p.topShadow, "sleeveR"));
  } else if (style === "hiphop") {
    // Oversized hoodie with kangaroo pocket + chain
    cells.push(
      ...renderCells(
        trapezoidCells(shoulderY - 1, torsoBottomY + 2, AXIS - shoulderW - 2, AXIS + shoulderW + 2, AXIS - shoulderW, AXIS + shoulderW),
        p.top,
        "hoodie",
      ),
    );
    // Pocket
    cells.push(...renderCells(rectCells(AXIS - 4, torsoBottomY - 6, AXIS + 4, torsoBottomY - 2), p.topShadow, "pocket"));
    // Drawstrings
    cells.push(...renderCells(rectCells(AXIS - 2, shoulderY, AXIS - 1, shoulderY + 5), p.topHilite, "dsL"));
    cells.push(...renderCells(rectCells(AXIS + 2, shoulderY, AXIS + 3, shoulderY + 5), p.topHilite, "dsR"));
    // Chain
    cells.push(...renderCells(rectCells(AXIS - 4, shoulderY - 1, AXIS + 4, shoulderY), p.accent, "chain"));
    // Long oversized sleeves
    cells.push(...renderCells(rectCells(AXIS - shoulderW - 3, shoulderY, AXIS - shoulderW, shoulderY + 12), p.top, "hsleeveL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderW, shoulderY, AXIS + shoulderW + 3, shoulderY + 12), p.topShadow, "hsleeveR"));
  } else if (style === "streetwear") {
    // Bomber jacket with sleeve stripes
    cells.push(
      ...renderCells(
        trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderW - 1, AXIS + shoulderW + 1, AXIS - waistW, AXIS + waistW),
        p.top,
        "bomber",
      ),
    );
    // Sleeves with stripe
    cells.push(...renderCells(rectCells(AXIS - shoulderW - 2, shoulderY, AXIS - shoulderW, shoulderY + 11), p.top, "bslvL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderW, shoulderY, AXIS + shoulderW + 2, shoulderY + 11), p.topShadow, "bslvR"));
    // Stripe on each sleeve
    for (let y = shoulderY + 2; y <= shoulderY + 10; y += 3) {
      cells.push(<rect key={`stripeL-${y}`} x={AXIS - shoulderW - 1} y={y} width={2} height={1} fill={p.accent} />);
      cells.push(<rect key={`stripeR-${y}`} x={AXIS + shoulderW} y={y} width={2} height={1} fill={p.accent} />);
    }
    // Zipper
    cells.push(...renderCells(rectCells(AXIS, shoulderY + 1, AXIS, torsoBottomY), p.topShadow, "zipper"));
  } else if (style === "athletic") {
    // Sports top — fitted, with side panel stripe
    cells.push(
      ...renderCells(
        trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderW, AXIS + shoulderW, AXIS - waistW, AXIS + waistW),
        p.top,
        "athTop",
      ),
    );
    // Side stripes
    cells.push(...renderCells(rectCells(AXIS - shoulderW, shoulderY, AXIS - shoulderW + 1, torsoBottomY), p.accent, "sideStripeL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderW - 1, shoulderY, AXIS + shoulderW, torsoBottomY), p.accent, "sideStripeR"));
    // Sleeveless or short sleeve — show arm skin (already drawn beneath)
  } else if (style === "dress") {
    // Dress — fitted top + flared skirt (drawn here as combined top, skirt handled below)
    cells.push(
      ...renderCells(
        trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderW + 1, AXIS + shoulderW - 1, AXIS - waistW + 1, AXIS + waistW - 1),
        p.top,
        "dressTop",
      ),
    );
    // Scoop neck
    cells.push(...renderCells(rectCells(AXIS - 3, shoulderY, AXIS + 3, shoulderY + 1), p.skin, "scoop"));
  }

  // ── BOTTOM
  if (style === "dress") {
    // Long flared skirt — trapezoid widening downward
    cells.push(
      ...renderCells(
        trapezoidCells(torsoBottomY, hipY + 9, AXIS - waistW + 1, AXIS + waistW - 1, AXIS - waistW - 4, AXIS + waistW + 4),
        p.top,
        "skirt",
      ),
    );
    // Folds (vertical accent lines)
    for (const dx of [-5, -2, 2, 5]) {
      cells.push(...renderCells(rectCells(AXIS + dx, torsoBottomY + 2, AXIS + dx, hipY + 8), p.topShadow, `fold${dx}`));
    }
  } else if (style === "streetwear" && bodyType === "fem") {
    // High-waist shorts (short) — bare legs below
    cells.push(...renderCells(rectCells(AXIS - waistW - 1, torsoBottomY, AXIS + waistW + 1, hipY + 3), p.bottom, "shorts"));
    cells.push(...renderCells(rectCells(AXIS + waistW, torsoBottomY, AXIS + waistW + 1, hipY + 3), p.bottomShadow, "shortsShd"));
    // Belt line
    cells.push(...renderCells(rectCells(AXIS - waistW - 1, torsoBottomY, AXIS + waistW + 1, torsoBottomY), p.bottomShadow, "shortsBelt"));
  } else {
    // Pants / slacks / joggers
    const pantsBottomY = legBottomY + 1;
    // left leg
    cells.push(...renderCells(rectCells(AXIS - hipW + 1, torsoBottomY, AXIS - 1, pantsBottomY), p.bottom, "pantsL"));
    // right leg
    cells.push(...renderCells(rectCells(AXIS + 1, torsoBottomY, AXIS + hipW - 1, pantsBottomY), p.bottom, "pantsR"));
    // shadow strips on right
    cells.push(...renderCells(rectCells(AXIS + hipW - 2, torsoBottomY, AXIS + hipW - 1, pantsBottomY), p.bottomShadow, "pantsRShd"));
    cells.push(...renderCells(rectCells(AXIS - 2, torsoBottomY, AXIS - 1, pantsBottomY), p.bottomShadow, "pantsLInShd"));
    // belt
    cells.push(...renderCells(rectCells(AXIS - hipW + 1, torsoBottomY, AXIS + hipW - 1, torsoBottomY + 1), darken(p.bottom, 0.5), "belt"));
    // buckle
    cells.push(<rect key="buckle" x={AXIS - 1} y={torsoBottomY} width={2} height={2} fill="#d4a83a" />);
    // hiphop has knee crease / cuff
    if (style === "hiphop" || style === "athletic") {
      // wider baggy — extend a column
      cells.push(...renderCells(rectCells(AXIS - hipW, torsoBottomY + 2, AXIS - hipW + 1, pantsBottomY), p.bottomShadow, "baggyL"));
      cells.push(...renderCells(rectCells(AXIS + hipW - 1, torsoBottomY + 2, AXIS + hipW, pantsBottomY), p.bottomShadow, "baggyR"));
    }
    // athletic stripe on legs
    if (style === "athletic") {
      for (let y = torsoBottomY + 3; y <= pantsBottomY - 1; y += 2) {
        cells.push(<rect key={`athStripeL${y}`} x={AXIS - hipW} y={y} width={1} height={1} fill={p.accent} />);
        cells.push(<rect key={`athStripeR${y}`} x={AXIS + hipW - 1} y={y} width={1} height={1} fill={p.accent} />);
      }
    }
  }

  // ── FEET (3/4 stance: LEFT foot forward+lower+wider, RIGHT foot back+higher+smaller)
  // Left foot: cols (AXIS-5 .. AXIS-1), rows 53-54
  const lFootTop = 53;
  const lFootBot = 55;
  // Right foot: smaller, slightly back+up
  const rFootTop = 52;
  const rFootBot = 54;
  cells.push(...renderCells(rectCells(AXIS - 6, lFootTop, AXIS, lFootBot), p.shoes, "lFoot"));
  cells.push(...renderCells(rectCells(AXIS - 1, lFootBot, AXIS, lFootBot), p.shoesShadow, "lFootShd"));
  cells.push(...renderCells(rectCells(AXIS + 1, rFootTop, AXIS + 5, rFootBot), p.shoes, "rFoot"));
  cells.push(...renderCells(rectCells(AXIS + 4, rFootTop, AXIS + 5, rFootBot), p.shoesShadow, "rFootShd"));
  // Sole highlights
  cells.push(...renderCells(rectCells(AXIS - 6, lFootBot, AXIS, lFootBot), lighten(p.shoes, 0.4), "lSole"));
  cells.push(...renderCells(rectCells(AXIS + 1, rFootBot, AXIS + 5, rFootBot), lighten(p.shoes, 0.4), "rSole"));

  // ── HAT (rendered later)
  if (hat && hat.kind !== "none") {
    const hatColor = hat.color ?? "#202028";
    if (hat.kind === "halo") {
      for (let x = AXIS - 5; x <= AXIS + 5; x++) {
        if (x === AXIS - 1 || x === AXIS) continue;
        cells.push(<rect key={`halo${x}`} x={x} y={headCy - headRy - 2} width={1} height={1} fill="#ffd55a" />);
      }
    } else if (hat.kind === "beanie") {
      cells.push(...renderCells(ellipseCells(AXIS, headCy - headRy + 1, headRx + 1, 3), hatColor, "beanie"));
    } else if (hat.kind === "cap") {
      cells.push(...renderCells(ellipseCells(AXIS, headCy - headRy + 2, headRx + 1, 3), hatColor, "cap"));
      // Brim
      cells.push(...renderCells(rectCells(AXIS - headRx - 3, headCy - headRy + 4, AXIS + headRx, headCy - headRy + 5), darken(hatColor, 0.3), "brim"));
    } else if (hat.kind === "hood") {
      cells.push(...renderCells(ellipseCells(AXIS, headCy - 2, headRx + 4, headRy + 3), hatColor, "hood"));
      // Hood opening
      cells.push(...renderCells(ellipseCells(AXIS - 1, headCy + 1, headRx - 1, headRy - 1), p.skin, "hoodFace"));
    }
  }

  return cells;
}

const PRESENCE_ANIM: Record<Presence, string> = {
  active: "animate-idle",
  lurking: "animate-breathe opacity-65",
  idle: "animate-breathe",
  away: "opacity-30",
};

// ─── public components ────────────────────────────────────────────────

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
  const face = FACES[kind];

  // Honor outfit.hair if set, else fall back to creature-specific hair color
  const effectiveOutfit: Outfit = { ...outfit, hair: outfit.hair ?? face.hairColor ?? "#2a1810" };
  const palette = resolvePalette(effectiveOutfit, face.skin);

  const headCy = 11;
  const headRx = bodyType === "fem" ? 6 : 7;
  const headRy = 7;

  // Hair behind head
  const hairStyle = pickHair(bodyType, style);
  const hairBehind = drawHair(palette, hairStyle, AXIS, headCy, headRx, headRy);

  const body = drawBody(palette, bodyType, style, outfit.hat);
  const features = drawFaceFeatures(palette, face, AXIS, headCy, headRy);

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
        {/* foot shadow */}
        <ellipse cx={AXIS} cy={GRID_H - 0.5} rx={8} ry={1.2} fill="#000" opacity={0.45} />
        {hairBehind}
        {body}
        {features}
      </svg>
    </div>
  );
}

// Face-only renderer (for face picker thumbnails)
export function CreatureFace({ kind, size = 4 }: { kind: CreatureKind; size?: number }) {
  const face = FACES[kind];
  const palette = resolvePalette({ shirt: "#2a4ac8", pants: "#000" }, face.skin);
  const headCx = 8;
  const headCy = 8;
  const headRx = 6;
  const headRy = 6;
  const W = 18;
  const H = 16;

  const cells: ReactNode[] = [];
  cells.push(...shadedEllipse(headCx, headCy, headRx, headRy, palette.skin, palette.skinShadow, "fhead"));
  cells.push(...drawFaceFeatures(palette, face, headCx, headCy, headRy));

  return (
    <svg
      viewBox={`-1 -2 ${W} ${H}`}
      width={W * size}
      height={H * size}
      shapeRendering="crispEdges"
      className="pixelated block"
    >
      {cells}
    </svg>
  );
}
