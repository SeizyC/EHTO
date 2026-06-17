// Object footprint obstacles for member placement. position-drift uses
// these so members never get scattered/drifted behind a tall object
// (fountain/tree/lamp) where the y-sort depth order (PlazaCanvas) would
// bury them. Short objects (dogs, planter) get radius 0 — members are
// meant to stand beside them via occupy slots, so they're not obstacles.

export type Obstacle = { x: number; y: number; radius: number };

// Below this display height (% of plaza), an object casts no keep-out.
// Dogs (3–4.5) and planter (8.5) fall under — members stand beside them.
const SHORT_H = 10;
// Keep-out (% units) per unit of height above SHORT_H. Tuned so the
// fountain (24) → ~5.6, lamp (33) → ~9.2, tree (44) → ~13.6.
const RADIUS_K = 0.4;

/** Height-scaled keep-out radius for an object of the given *effective*
 *  display height (nativeHeightPct × scale). Short objects → 0. */
export function obstacleRadius(effectiveHeightPct: number): number {
  return Math.max(0, (effectiveHeightPct - SHORT_H) * RADIUS_K);
}

/** Iso-weighted distance: the depth (y) axis is compressed ×1.4 so
 *  "behind / in front" counts more than left/right — matches the
 *  perspective the plaza is drawn in. Mirrors the metric position-drift
 *  uses between characters. */
export function isoDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * 1.4;
  return Math.sqrt(dx * dx + dy * dy);
}

/** True when `pt` sits outside every obstacle's keep-out radius. */
export function clearOfObstacles(
  pt: { x: number; y: number },
  obstacles: Obstacle[],
): boolean {
  return obstacles.every((o) => isoDist(pt, o) >= o.radius);
}
