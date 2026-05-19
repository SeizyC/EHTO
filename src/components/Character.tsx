import clsx from "clsx";
import type { ReactNode } from "react";
import type { BodyType, CreatureKind, Outfit, OutfitStyle, Presence, SkinTone } from "@/types/world";
import { darken, lighten } from "@/lib/color";
import {
  ellipseCells,
  lineCells,
  rectCells,
  renderCells,
  shadedEllipse,
  trapezoidCells,
} from "./pixelDraw";

// ─── grid ──────────────────────────────────────────────────────────────
const GRID_W = 32;
const GRID_H = 56;
const AXIS = 16;

// ─── skin tones ────────────────────────────────────────────────────────
const SKIN_TONES: Record<SkinTone, string> = {
  porcelain: "#f9d9b9",
  fair: "#f0c8a0",
  warm: "#d99463",
  tan: "#b4744a",
  deep: "#75462a",
};

// ─── face style presets ────────────────────────────────────────────────
interface FacePreset {
  skin: SkinTone;
  eye: "round" | "narrow" | "wide" | "closed";
  mouth: "smile" | "neutral" | "smirk" | "pout";
  glasses?: "round" | "shades" | "none";
  blushAccent: string;
  freckles?: boolean;
}

const PRESETS: Record<CreatureKind, FacePreset> = {
  cheerful: { skin: "fair", eye: "round", mouth: "smile", blushAccent: "#ff9aa2" },
  cool: { skin: "warm", eye: "narrow", mouth: "smirk", glasses: "shades", blushAccent: "#7af0ff" },
  shy: { skin: "porcelain", eye: "wide", mouth: "pout", blushAccent: "#ff9aa2" },
  sleepy: { skin: "fair", eye: "closed", mouth: "neutral", blushAccent: "#f3c97a" },
  geek: { skin: "fair", eye: "round", mouth: "neutral", glasses: "round", freckles: true, blushAccent: "#f37a7a" },
  playful: { skin: "tan", eye: "round", mouth: "smile", freckles: true, blushAccent: "#ff7ab6" },
  soft: { skin: "porcelain", eye: "round", mouth: "smile", blushAccent: "#ffb8c8" },
  mysterious: { skin: "deep", eye: "narrow", mouth: "smirk", glasses: "shades", blushAccent: "#9ab0ff" },
};

// ─── palette ───────────────────────────────────────────────────────────
interface Palette {
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
  shoes: string;
  shoesShadow: string;
  accent: string;
}

function buildPalette(outfit: Outfit, skinTone: SkinTone): Palette {
  const skin = SKIN_TONES[skinTone];
  const hair = outfit.hair ?? "#2a1810";
  const top = outfit.shirt;
  const bottom = outfit.pants;
  const shoes = outfit.shoes ?? "#1a1620";
  return {
    skin,
    skinShadow: darken(skin, 0.22),
    skinHilite: lighten(skin, 0.14),
    hair,
    hairShadow: darken(hair, 0.4),
    hairHilite: lighten(hair, 0.25),
    top,
    topShadow: darken(top, 0.32),
    topHilite: lighten(top, 0.22),
    bottom,
    bottomShadow: darken(bottom, 0.34),
    shoes,
    shoesShadow: darken(shoes, 0.4),
    accent: outfit.accent ?? "#1a1a26",
  };
}

// ─── HAIR (rendered behind head) ───────────────────────────────────────
type HairStyle = "short" | "bob" | "long" | "spike" | "tied" | "buzz";

function pickHair(bodyType: BodyType, style: OutfitStyle): HairStyle {
  if (bodyType === "fem") {
    if (style === "athletic") return "tied";
    if (style === "hiphop") return "long";
    return "bob";
  }
  if (style === "hiphop") return "spike";
  return "short";
}

function drawHair(p: Palette, hair: HairStyle, headCx: number, headCy: number, headRx: number, headRy: number): ReactNode[] {
  const cells: Array<{ x: number; y: number; layer: "back" | "front" }> = [];
  if (hair === "buzz") {
    // very short — top fuzz only
    ellipseCells(headCx, headCy - headRy + 1, headRx, 2).forEach((c) => cells.push({ ...c, layer: "front" }));
  } else if (hair === "short") {
    // crown + sideburns; face stays visible
    ellipseCells(headCx, headCy - 1, headRx + 1, headRy).forEach((c) => {
      if (c.y <= headCy - 2) cells.push({ ...c, layer: "front" });
    });
    // small back-of-head bulge on left (since 3/4 facing right shows back-of-head on left)
    ellipseCells(headCx - headRx, headCy, 2, 3).forEach((c) => cells.push({ ...c, layer: "back" }));
  } else if (hair === "bob") {
    // wider, frames cheeks
    const back = ellipseCells(headCx, headCy + 1, headRx + 2, headRy + 3);
    back.forEach((c) => {
      const inFace = c.y >= headCy - 1 && c.y <= headCy + headRy - 3 && c.x >= headCx - headRx + 1 && c.x <= headCx + headRx - 1;
      if (!inFace) cells.push({ ...c, layer: c.y < headCy ? "front" : "back" });
    });
  } else if (hair === "long") {
    const top = ellipseCells(headCx, headCy, headRx + 2, headRy + 2);
    top.forEach((c) => {
      const inFace = c.y >= headCy - 1 && c.y <= headCy + headRy - 3 && c.x >= headCx - headRx + 2 && c.x <= headCx + headRx - 1;
      if (!inFace) cells.push({ ...c, layer: c.y < headCy ? "front" : "back" });
    });
    // strands flowing down
    rectCells(headCx - headRx - 1, headCy + 2, headCx - headRx, headCy + headRy + 10).forEach((c) =>
      cells.push({ ...c, layer: "back" }),
    );
    rectCells(headCx + headRx, headCy + 2, headCx + headRx + 1, headCy + headRy + 10).forEach((c) =>
      cells.push({ ...c, layer: "back" }),
    );
  } else if (hair === "spike") {
    const base = ellipseCells(headCx, headCy - 1, headRx + 1, headRy);
    base.forEach((c) => {
      if (c.y <= headCy - 1) cells.push({ ...c, layer: "front" });
    });
    [-4, -1, 2].forEach((dx) => {
      rectCells(headCx + dx, headCy - headRy - 3, headCx + dx + 1, headCy - headRy + 1).forEach((c) =>
        cells.push({ ...c, layer: "front" }),
      );
    });
  } else if (hair === "tied") {
    // crown + ponytail hanging back (on left side since 3/4 faces right)
    ellipseCells(headCx, headCy - 1, headRx + 1, headRy).forEach((c) => {
      if (c.y <= headCy - 1) cells.push({ ...c, layer: "front" });
    });
    rectCells(headCx - headRx - 2, headCy, headCx - headRx, headCy + headRy + 6).forEach((c) =>
      cells.push({ ...c, layer: "back" }),
    );
  }

  return cells.map((c, i) => (
    <rect key={`hr-${i}`} x={c.x} y={c.y} width={1} height={1} fill={c.x > headCx ? p.hairShadow : p.hair} />
  ));
}

// ─── FACE features (3/4 view: features cluster on RIGHT side of head) ──
function drawFace(p: Palette, preset: FacePreset, cx: number, cy: number, rx: number, ry: number): ReactNode[] {
  const cells: ReactNode[] = [];

  // Nose silhouette — 1px hint on right (front) side of face
  cells.push(<rect key="nose1" x={cx + rx - 1} y={cy + 1} width={1} height={1} fill={p.skinShadow} />);
  cells.push(<rect key="nose2" x={cx + rx - 1} y={cy + 2} width={1} height={1} fill={p.skinShadow} />);

  // Eyes — 3/4 view: both visible, RIGHT eye larger (closer to front)
  const eyeL_x = cx - 2; // back eye
  const eyeR_x = cx + 1; // front eye
  const eyeY = cy;

  if (preset.eye === "closed") {
    // Two horizontal dashes
    cells.push(<rect key="eL" x={eyeL_x} y={eyeY + 1} width={1} height={1} fill="#1a0d05" />);
    cells.push(<rect key="eR" x={eyeR_x} y={eyeY + 1} width={2} height={1} fill="#1a0d05" />);
  } else if (preset.eye === "round" || preset.eye === "wide") {
    const sz = preset.eye === "wide" ? 2 : 2;
    // back eye smaller (1x2)
    cells.push(<rect key="eL" x={eyeL_x} y={eyeY} width={1} height={2} fill="#1a0d05" />);
    // front eye full 2x2 with shine
    cells.push(<rect key="eR1" x={eyeR_x} y={eyeY} width={2} height={sz} fill="#1a0d05" />);
    cells.push(<rect key="eR2" x={eyeR_x + 1} y={eyeY} width={1} height={1} fill="#ffffff" />);
  } else if (preset.eye === "narrow") {
    // thin horizontal slits
    cells.push(<rect key="eL" x={eyeL_x} y={eyeY + 1} width={1} height={1} fill="#1a0d05" />);
    cells.push(<rect key="eR" x={eyeR_x} y={eyeY + 1} width={2} height={1} fill="#1a0d05" />);
  }

  // Glasses
  if (preset.glasses === "round") {
    // Two circles around eyes connected by bridge
    cells.push(<rect key="gl1" x={eyeL_x - 1} y={eyeY - 1} width={3} height={3} fill="none" stroke="#1a0d05" strokeWidth={0.5} />);
    cells.push(<rect key="gl2" x={eyeR_x - 1} y={eyeY - 1} width={3} height={3} fill="none" stroke="#1a0d05" strokeWidth={0.5} />);
  } else if (preset.glasses === "shades") {
    // Solid dark band across eyes
    cells.push(<rect key="sh" x={eyeL_x - 1} y={eyeY} width={6} height={2} fill="#1a0d05" />);
    // Highlight on lens
    cells.push(<rect key="shHl" x={eyeR_x} y={eyeY} width={1} height={1} fill="#7af0ff" opacity={0.6} />);
  }

  // Mouth — small, shifted toward front (right) side
  const mouthY = cy + ry - 2;
  const mouthX = cx;
  if (preset.mouth === "smile") {
    cells.push(<rect key="m1" x={mouthX} y={mouthY} width={2} height={1} fill="#8c3a30" />);
    cells.push(<rect key="m2" x={mouthX + 2} y={mouthY - 1} width={1} height={1} fill={preset.blushAccent} />);
  } else if (preset.mouth === "neutral") {
    cells.push(<rect key="m" x={mouthX} y={mouthY} width={2} height={1} fill="#8c3a30" />);
  } else if (preset.mouth === "smirk") {
    cells.push(<rect key="m" x={mouthX + 1} y={mouthY} width={2} height={1} fill="#8c3a30" />);
    cells.push(<rect key="m2" x={mouthX + 2} y={mouthY - 1} width={1} height={1} fill="#8c3a30" />);
  } else if (preset.mouth === "pout") {
    cells.push(<rect key="m" x={mouthX + 1} y={mouthY} width={1} height={1} fill={preset.blushAccent} />);
  }

  // Cheek blush (right side prominent)
  cells.push(<rect key="bl" x={cx + 1} y={cy + 3} width={2} height={1} fill={preset.blushAccent} opacity={0.5} />);
  cells.push(<rect key="bl2" x={cx - 3} y={cy + 3} width={1} height={1} fill={preset.blushAccent} opacity={0.35} />);

  // Freckles (optional)
  if (preset.freckles) {
    cells.push(<rect key="fr1" x={cx} y={cy + 2} width={1} height={1} fill={p.skinShadow} />);
    cells.push(<rect key="fr2" x={cx + 2} y={cy + 3} width={1} height={1} fill={p.skinShadow} />);
    cells.push(<rect key="fr3" x={cx - 1} y={cy + 3} width={1} height={1} fill={p.skinShadow} />);
  }

  return cells;
}

// ─── BODY (3/4 turn: front of body on viewer RIGHT, back on LEFT) ──────
function drawBody(p: Palette, bodyType: BodyType, style: OutfitStyle, hat?: Outfit["hat"]): ReactNode[] {
  const cells: ReactNode[] = [];

  const headCy = 11;
  const headRx = bodyType === "fem" ? 5 : 6;
  const headRy = 7;

  // 3/4 stance offsets — right side (front) is wider, left side (back) is narrower
  const shoulderL = bodyType === "fem" ? 5 : 6; // back-side narrower
  const shoulderR = bodyType === "fem" ? 7 : 8; // front-side wider
  const waistL = bodyType === "fem" ? 4 : 5;
  const waistR = bodyType === "fem" ? 6 : 6;

  const shoulderY = 22;
  const torsoBottomY = 36;
  const hipY = 41;
  const hipL = bodyType === "fem" ? 6 : 5;
  const hipR = bodyType === "fem" ? 7 : 6;
  const legBottomY = 51;

  // Head (skin oval) — shifted slightly RIGHT for 3/4 face turn
  const headCx = AXIS + 1;
  cells.push(...shadedEllipse(headCx, headCy, headRx, headRy, p.skin, p.skinShadow, "head"));

  // Neck
  cells.push(...renderCells(rectCells(headCx - 2, headCy + headRy - 1, headCx + 2, shoulderY - 1), p.skin, "neck"));
  cells.push(...renderCells(rectCells(headCx + 1, headCy + headRy - 1, headCx + 2, shoulderY - 1), p.skinShadow, "neckShd"));

  // Arms skin (drawn before clothing covers them for sleeveless styles)
  cells.push(...renderCells(rectCells(AXIS - shoulderL - 1, shoulderY + 1, AXIS - shoulderL, shoulderY + 11), p.skin, "armL"));
  cells.push(...renderCells(rectCells(AXIS + shoulderR, shoulderY + 1, AXIS + shoulderR + 1, shoulderY + 11), p.skin, "armR"));
  // Hands
  cells.push(...renderCells(rectCells(AXIS - shoulderL - 2, shoulderY + 9, AXIS - shoulderL, shoulderY + 13), p.skinShadow, "handL"));
  cells.push(...renderCells(rectCells(AXIS + shoulderR, shoulderY + 9, AXIS + shoulderR + 2, shoulderY + 13), p.skin, "handR"));

  // Bare-leg skin (underneath bottoms)
  cells.push(...renderCells(rectCells(AXIS - 4, hipY, AXIS + 4, legBottomY), p.skin, "legs"));

  // TORSO (clothing) — asymmetric trapezoid for 3/4 turn
  if (style === "casual") {
    cells.push(...renderCells(trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderL, AXIS + shoulderR, AXIS - waistL, AXIS + waistR), p.top, "top"));
    cells.push(...renderCells(rectCells(AXIS - shoulderL, shoulderY, AXIS - shoulderL + 1, shoulderY + 4), p.topShadow, "slvL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderR - 1, shoulderY, AXIS + shoulderR, shoulderY + 4), p.top, "slvR"));
    // collar
    cells.push(...renderCells(rectCells(headCx - 3, shoulderY, headCx + 3, shoulderY + 1), p.topShadow, "collar"));
    // right rim shadow
    cells.push(...renderCells(rectCells(AXIS + waistR - 1, shoulderY + 1, AXIS + shoulderR - 1, torsoBottomY), p.topShadow, "rim"));
  } else if (style === "suit") {
    cells.push(...renderCells(trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderL - 1, AXIS + shoulderR + 1, AXIS - waistL - 1, AXIS + waistR), p.top, "suit"));
    // V-neck white
    for (let i = 0; i < 6; i++) {
      const w = Math.max(1, 4 - Math.floor(i / 1.5));
      cells.push(...renderCells(rectCells(headCx - w, shoulderY + 1 + i, headCx + w, shoulderY + 1 + i), "#f4f4f8", `wht${i}`));
    }
    // Tie
    cells.push(...renderCells(rectCells(headCx - 1, shoulderY + 4, headCx + 1, torsoBottomY - 2), p.accent, "tie"));
    // Lapel lines
    cells.push(...renderCells(lineCells(headCx - 4, shoulderY + 1, headCx - 1, shoulderY + 6), p.topShadow, "lapL"));
    cells.push(...renderCells(lineCells(headCx + 4, shoulderY + 1, headCx + 1, shoulderY + 6), p.topShadow, "lapR"));
    // Sleeves
    cells.push(...renderCells(rectCells(AXIS - shoulderL - 2, shoulderY + 1, AXIS - shoulderL, shoulderY + 11), p.topShadow, "ssvL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderR, shoulderY + 1, AXIS + shoulderR + 2, shoulderY + 11), p.top, "ssvR"));
  } else if (style === "hiphop") {
    // Oversized hoodie
    cells.push(...renderCells(trapezoidCells(shoulderY - 1, torsoBottomY + 2, AXIS - shoulderL - 2, AXIS + shoulderR + 2, AXIS - shoulderL, AXIS + shoulderR), p.top, "hood"));
    // Pocket
    cells.push(...renderCells(rectCells(AXIS - 4, torsoBottomY - 5, AXIS + 4, torsoBottomY - 1), p.topShadow, "pkt"));
    // Drawstrings
    cells.push(...renderCells(rectCells(headCx - 2, shoulderY, headCx - 1, shoulderY + 5), p.topHilite, "dsL"));
    cells.push(...renderCells(rectCells(headCx + 1, shoulderY, headCx + 2, shoulderY + 5), p.topHilite, "dsR"));
    // Chain
    cells.push(...renderCells(rectCells(headCx - 4, shoulderY - 1, headCx + 4, shoulderY), p.accent, "chn"));
    // Long sleeves
    cells.push(...renderCells(rectCells(AXIS - shoulderL - 3, shoulderY, AXIS - shoulderL, shoulderY + 13), p.topShadow, "hsl"));
    cells.push(...renderCells(rectCells(AXIS + shoulderR, shoulderY, AXIS + shoulderR + 3, shoulderY + 13), p.top, "hsr"));
  } else if (style === "streetwear") {
    cells.push(...renderCells(trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderL - 1, AXIS + shoulderR + 1, AXIS - waistL, AXIS + waistR), p.top, "str"));
    cells.push(...renderCells(rectCells(AXIS - shoulderL - 2, shoulderY, AXIS - shoulderL, shoulderY + 11), p.topShadow, "stsL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderR, shoulderY, AXIS + shoulderR + 2, shoulderY + 11), p.top, "stsR"));
    // Sleeve stripes
    for (let y = shoulderY + 2; y <= shoulderY + 10; y += 3) {
      cells.push(<rect key={`spL${y}`} x={AXIS - shoulderL - 1} y={y} width={2} height={1} fill={p.accent} />);
      cells.push(<rect key={`spR${y}`} x={AXIS + shoulderR} y={y} width={2} height={1} fill={p.accent} />);
    }
    // Zipper
    cells.push(...renderCells(rectCells(headCx, shoulderY + 1, headCx, torsoBottomY), p.topShadow, "zip"));
  } else if (style === "athletic") {
    cells.push(...renderCells(trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderL, AXIS + shoulderR, AXIS - waistL, AXIS + waistR), p.top, "ath"));
    cells.push(...renderCells(rectCells(AXIS - shoulderL, shoulderY, AXIS - shoulderL + 1, torsoBottomY), p.accent, "asL"));
    cells.push(...renderCells(rectCells(AXIS + shoulderR - 1, shoulderY, AXIS + shoulderR, torsoBottomY), p.accent, "asR"));
  } else if (style === "dress") {
    cells.push(...renderCells(trapezoidCells(shoulderY, torsoBottomY, AXIS - shoulderL + 1, AXIS + shoulderR - 1, AXIS - waistL + 1, AXIS + waistR - 1), p.top, "dr"));
    // Scoop neck
    cells.push(...renderCells(rectCells(headCx - 3, shoulderY, headCx + 3, shoulderY + 1), p.skin, "sc"));
  }

  // BOTTOM
  if (style === "dress") {
    cells.push(...renderCells(trapezoidCells(torsoBottomY, hipY + 9, AXIS - waistL + 1, AXIS + waistR - 1, AXIS - waistL - 5, AXIS + waistR + 5), p.top, "skirt"));
    for (const dx of [-5, -2, 2, 5]) {
      cells.push(...renderCells(rectCells(AXIS + dx, torsoBottomY + 2, AXIS + dx, hipY + 8), p.topShadow, `fld${dx}`));
    }
  } else if (style === "streetwear" && bodyType === "fem") {
    cells.push(...renderCells(rectCells(AXIS - waistL - 1, torsoBottomY, AXIS + waistR + 1, hipY + 3), p.bottom, "shorts"));
    cells.push(...renderCells(rectCells(AXIS + waistR, torsoBottomY, AXIS + waistR + 1, hipY + 3), p.bottomShadow, "shsh"));
  } else {
    const pantsBottomY = legBottomY + 1;
    cells.push(...renderCells(rectCells(AXIS - hipL, torsoBottomY, AXIS - 1, pantsBottomY), p.bottom, "pL"));
    cells.push(...renderCells(rectCells(AXIS + 1, torsoBottomY, AXIS + hipR, pantsBottomY), p.bottom, "pR"));
    cells.push(...renderCells(rectCells(AXIS + hipR - 1, torsoBottomY, AXIS + hipR, pantsBottomY), p.bottomShadow, "pRSh"));
    cells.push(...renderCells(rectCells(AXIS - 2, torsoBottomY, AXIS - 1, pantsBottomY), p.bottomShadow, "pLSh"));
    cells.push(...renderCells(rectCells(AXIS - hipL, torsoBottomY, AXIS + hipR, torsoBottomY + 1), darken(p.bottom, 0.5), "blt"));
    cells.push(<rect key="bkl" x={AXIS - 1} y={torsoBottomY} width={2} height={2} fill="#d4a83a" />);
    if (style === "athletic" || style === "hiphop") {
      for (let y = torsoBottomY + 3; y <= pantsBottomY - 1; y += 2) {
        cells.push(<rect key={`stpL${y}`} x={AXIS - hipL} y={y} width={1} height={1} fill={p.accent} />);
        cells.push(<rect key={`stpR${y}`} x={AXIS + hipR - 1} y={y} width={1} height={1} fill={p.accent} />);
      }
    }
  }

  // FEET — both pointing toward viewer's LOWER-RIGHT (3/4 stance).
  // Right foot (front, character's right) is closer to viewer, lower-right on screen.
  // Left foot (back) is behind, slightly higher-left on screen.

  // Back foot (smaller, higher, left on screen)
  cells.push(...renderCells(rectCells(AXIS - 4, 52, AXIS, 53), p.shoes, "fBk"));
  cells.push(...renderCells(rectCells(AXIS - 1, 52, AXIS, 53), p.shoesShadow, "fBkSh"));
  // Front foot (bigger, lower, right on screen) — angled by drawing trapezoid
  cells.push(...renderCells(trapezoidCells(53, 55, AXIS, AXIS + 3, AXIS + 1, AXIS + 6), p.shoes, "fFr"));
  cells.push(...renderCells(rectCells(AXIS + 5, 54, AXIS + 6, 55), p.shoesShadow, "fFrSh"));
  // Sole highlights
  cells.push(...renderCells(rectCells(AXIS - 4, 53, AXIS, 53), lighten(p.shoes, 0.45), "solBk"));
  cells.push(...renderCells(rectCells(AXIS + 1, 55, AXIS + 6, 55), lighten(p.shoes, 0.45), "solFr"));

  // HAT
  if (hat && hat.kind !== "none") {
    const hatColor = hat.color ?? "#202028";
    if (hat.kind === "halo") {
      for (let x = headCx - 4; x <= headCx + 4; x++) {
        if (x === headCx - 1 || x === headCx) continue;
        cells.push(<rect key={`halo${x}`} x={x} y={headCy - headRy - 2} width={1} height={1} fill="#ffd55a" />);
      }
    } else if (hat.kind === "beanie") {
      cells.push(...renderCells(ellipseCells(headCx, headCy - headRy + 1, headRx + 1, 3), hatColor, "bnh"));
    } else if (hat.kind === "cap") {
      cells.push(...renderCells(ellipseCells(headCx, headCy - headRy + 2, headRx + 1, 3), hatColor, "cap"));
      cells.push(...renderCells(rectCells(headCx - headRx - 2, headCy - headRy + 4, headCx + headRx + 1, headCy - headRy + 5), darken(hatColor, 0.3), "brim"));
    } else if (hat.kind === "hood") {
      cells.push(...renderCells(ellipseCells(headCx, headCy - 1, headRx + 3, headRy + 2), hatColor, "hood"));
      cells.push(...renderCells(ellipseCells(headCx, headCy + 1, headRx - 1, headRy - 1), p.skin, "hf"));
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

// ─── public component ─────────────────────────────────────────────────

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
  const preset = PRESETS[kind] ?? PRESETS.cheerful;
  const palette = buildPalette(outfit, preset.skin);

  const headCy = 11;
  const headRx = bodyType === "fem" ? 5 : 6;
  const headRy = 7;
  const headCx = AXIS + 1;

  const hairStyle = pickHair(bodyType, style);
  const hairCells = drawHair(palette, hairStyle, headCx, headCy, headRx, headRy);
  const bodyCells = drawBody(palette, bodyType, style, outfit.hat);
  const faceCells = drawFace(palette, preset, headCx, headCy, headRx, headRy);

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
        <ellipse cx={AXIS + 1} cy={GRID_H - 0.5} rx={9} ry={1.4} fill="#000" opacity={0.45} />
        {hairCells}
        {bodyCells}
        {faceCells}
      </svg>
    </div>
  );
}

// Face-only renderer (preset thumbnail)
export function CreatureFace({ kind, size = 4 }: { kind: CreatureKind; size?: number }) {
  const preset = PRESETS[kind] ?? PRESETS.cheerful;
  const palette = buildPalette({ shirt: "#2a4ac8", pants: "#000" }, preset.skin);
  const cx = 10;
  const cy = 8;
  const rx = 6;
  const ry = 7;
  const W = 20;
  const H = 16;

  const cells: ReactNode[] = [];
  cells.push(...shadedEllipse(cx, cy, rx, ry, palette.skin, palette.skinShadow, "fh"));
  cells.push(...drawFace(palette, preset, cx, cy, rx, ry));

  return (
    <svg
      viewBox={`-1 -1 ${W} ${H}`}
      width={W * size}
      height={H * size}
      shapeRendering="crispEdges"
      className="pixelated block"
    >
      {cells}
    </svg>
  );
}
