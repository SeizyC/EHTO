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

/** True when `pt` would be BURIED behind a tall object. The base keep-out
 *  above is a circle, but a tall sprite (building/fountain/tree) also paints
 *  over anyone standing behind it (lower y → drawn earlier in the y-sort)
 *  within its horizontal span — even outside that circle. This forbids that
 *  vertical "shadow" wedge so a character never disappears behind an object.
 *  Depth of the wedge scales with the object's keep-out radius (∝ height). */
export function occludedBehind(
  pt: { x: number; y: number },
  obstacles: Obstacle[],
): boolean {
  for (const o of obstacles) {
    if (o.radius <= 0) continue;      // short objects don't hide anyone
    if (pt.y >= o.y) continue;        // level with / in front of the base → visible
    const halfWidth = o.radius;       // horizontal cover ≈ keep-out radius
    const shadowDepth = o.radius * 2.5; // how far back a tall sprite reaches
    if (Math.abs(pt.x - o.x) <= halfWidth && o.y - pt.y <= shadowDepth) return true;
  }
  return false;
}
