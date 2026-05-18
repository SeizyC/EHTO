// Procedural pixel-art drawing utilities.
// Each function returns an array of SVG <rect> JSX elements at integer
// coordinates, suitable for crisp pixel art when wrapped in
// <svg shapeRendering="crispEdges">.

import type { ReactNode } from "react";

export type Cell = { x: number; y: number; fill: string };

export function ellipseCells(cx: number, cy: number, rx: number, ry: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) out.push({ x, y });
    }
  }
  return out;
}

export function rectCells(x1: number, y1: number, x2: number, y2: number) {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) out.push({ x, y });
  return out;
}

// Trapezoid (used for torso, hips that taper).
export function trapezoidCells(yTop: number, yBottom: number, xLeftTop: number, xRightTop: number, xLeftBottom: number, xRightBottom: number) {
  const out: Array<{ x: number; y: number }> = [];
  const h = yBottom - yTop;
  for (let y = yTop; y <= yBottom; y++) {
    const t = h === 0 ? 0 : (y - yTop) / h;
    const xl = Math.round(xLeftTop + (xLeftBottom - xLeftTop) * t);
    const xr = Math.round(xRightTop + (xRightBottom - xRightTop) * t);
    for (let x = xl; x <= xr; x++) out.push({ x, y });
  }
  return out;
}

// Diagonal line of pixels (Bresenham-ish, integer coords).
export function lineCells(x1: number, y1: number, x2: number, y2: number) {
  const out: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;
  while (true) {
    out.push({ x, y });
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

export function renderCells(
  cells: Array<{ x: number; y: number }>,
  fill: string,
  keyPrefix: string,
): ReactNode[] {
  return cells.map((c, i) => (
    // eslint-disable-next-line react/no-array-index-key
    <rect key={`${keyPrefix}-${i}`} x={c.x} y={c.y} width={1} height={1} fill={fill} />
  ));
}

// Shade an ellipse with primary + a one-pixel-deeper "rim" on the right/bottom
// for a 3/4 turn look.
export function shadedEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  main: string,
  shade: string,
  keyPrefix: string,
): ReactNode[] {
  const cells = ellipseCells(cx, cy, rx, ry);
  return cells.map((c, i) => {
    const dx = (c.x + 0.5 - cx) / rx;
    const dy = (c.y + 0.5 - cy) / ry;
    // pixel is "rim" if close to edge AND on right-or-bottom side
    const dist = Math.sqrt(dx * dx + dy * dy);
    const onShadeSide = dx > 0.15 || dy > 0.2;
    const isRim = dist > 0.72;
    const fill = isRim && onShadeSide ? shade : main;
    // eslint-disable-next-line react/no-array-index-key
    return <rect key={`${keyPrefix}-${i}`} x={c.x} y={c.y} width={1} height={1} fill={fill} />;
  });
}
