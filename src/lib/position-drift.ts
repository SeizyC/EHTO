// Server-side plaza position management.
//
// Called from /api/world/members on each owner-on-/world poll (~8s).
// Two responsibilities, in order:
//
//   1. Scatter uninitialized members. A member whose (x, y, flip) still
//      matches the migration defaults (50, 60, false) has never been
//      placed — we sprinkle them across the floor band, avoiding the
//      owner avatar and any already-placed members.
//   2. Gentle drift. Pick up to MAX_MOVERS_PER_TICK eligible members
//      (past cooldown, weight ≥ 0.3) and shift each by a small step,
//      again avoiding stacking on neighbours.

import type { SupabaseClient } from "@supabase/supabase-js";
import { OBJECT_CATALOG, type PlazaObjectType } from "@/lib/plaza-objects";
import { catalogAll } from "@/lib/object-catalog";
import {
  obstacleRadius,
  isoDist,
  clearOfObstacles,
  occludedBehind,
  type Obstacle,
} from "@/lib/plaza-obstacles";

// Floor band — widened in two passes 2026-05-31:
//   pass 1: (14–86 / 42–80) → (8–92 / 36–80)   — use whole canvas
//   pass 2: (8–92 / 36–80)  → (5–95 / 32–82)   — 30+ members target
// Combined with CHARACTER_HEIGHT_PCT 15→12 and MIN_GAP 14→11 below,
// gives comfortable capacity ≈ 30 characters before stacking.
const FLOOR_X_MIN = 5;
const FLOOR_X_MAX = 95;
// MIN raised to 42 (2026-06-24): top band reserved for the sky-fade + aerial
// objects, so roaming people don't walk up into the "sky".
const FLOOR_Y_MIN = 42;
const FLOOR_Y_MAX = 88;
// Plaza center — characters left of this face right and vice versa,
// so the room reads as people gravitating toward the middle rather
// than a forward-facing lineup.
const PLAZA_CENTER_X = 50;

// Three depth bands so scatter doesn't clump everyone at the same iso
// depth. Picking a bucket then uniformly sampling within it gives real
// front/mid/back variance. Re-tuned 2026-05-31 to span the wider y
// floor band (32–82).
const DEPTH_BUCKETS: Array<[number, number]> = [
  [42, 57],   // back
  [58, 73],   // mid
  [74, 88],   // front
];

// Per-member minimum gap between two drifts. 45s gives the room a
// settled feeling rather than constant fidgeting.
const PER_MEMBER_COOLDOWN_MS = 45_000;

// How many members are allowed to drift in a single tick. Tight cap
// prevents the whole room sliding around at once.
const MAX_MOVERS_PER_TICK = 2;

// Drift step in plaza-percent.
const MAX_DX = 6;
const MAX_DY = 4;

// Minimum distance between two characters. 12 → 14 → 11 → 9
// (2026-05-31): with CHARACTER_HEIGHT_PCT down to 9 the visual
// footprint shrinks proportionally, so MIN_GAP can shrink with it
// without anyone feeling squished. Comfortable capacity now ≈ 50,
// well above the 30-member target.
const MIN_GAP = 9;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

// Pick a random floor-band point clear of every `taken` character AND
// every object obstacle. Prefers a spot that's both clear of obstacles
// and ≥ MIN_GAP from neighbours; falls back to the best obstacle-clear
// spot, then to the best spot overall, so dense plazas still progress.
export function pickClearSpot(
  taken: Array<{ x: number; y: number }>,
  obstacles: Obstacle[],
  yBand?: [number, number],
  attempts = 12,
): { x: number; y: number } {
  const [yMin, yMax] = yBand
    ?? DEPTH_BUCKETS[Math.floor(Math.random() * DEPTH_BUCKETS.length)];
  const sample = () => ({
    x: FLOOR_X_MIN + Math.random() * (FLOOR_X_MAX - FLOOR_X_MIN),
    y: yMin + Math.random() * (yMax - yMin),
  });
  let best = sample();
  let bestMinD = -1;
  let bestClear: { x: number; y: number } | null = null;
  let bestClearMinD = -1;
  for (let i = 0; i < attempts; i++) {
    const cand = sample();
    const clear = clearOfObstacles(cand, obstacles) && !occludedBehind(cand, obstacles);
    const minD = taken.length === 0
      ? Infinity
      : Math.min(...taken.map((t) => isoDist(cand, t)));
    if (clear && minD >= MIN_GAP) return cand;
    if (clear && minD > bestClearMinD) { bestClearMinD = minD; bestClear = cand; }
    if (minD > bestMinD) { bestMinD = minD; best = cand; }
  }
  return bestClear ?? best;
}

type Row = {
  id: string;
  x: number | null;
  y: number | null;
  flip: boolean | null;
  pos_updated_at: string | null;
  status: string;
  activated_at: string | null;
  activity_weight: number;
};

function isUninitialized(r: Row): boolean {
  // Match the migration defaults exactly. AI members are placed by this
  // function so the only way (50, 60, false) lingers is if no scatter
  // has run yet for that row.
  return r.x === 50 && r.y === 60 && r.flip === false;
}

// Build object keep-out obstacles for a world. Static types resolve
// their display height from the TS catalog; dynamic types from the DB
// catalog (by variant id). Short objects (radius 0) are dropped.
export async function buildObstacles(
  sb: SupabaseClient,
  worldId: string,
): Promise<Obstacle[]> {
  const { data: objRows } = await sb
    .from("plaza_objects")
    .select("x, y, scale, type, variant_id")
    .eq("world_id", worldId);
  if (!objRows || objRows.length === 0) return [];
  const cat = await catalogAll(sb);
  const heightByVariant = new Map<string, number>();
  const heightByTypeKey = new Map<string, number>();
  for (const t of cat) {
    heightByTypeKey.set(t.typeKey, t.nativeHeightPct);
    for (const v of t.variants) heightByVariant.set(v.id, t.nativeHeightPct);
  }
  const obstacles: Obstacle[] = [];
  for (const r of objRows as Array<{ x: number; y: number; scale: number | null; type: string; variant_id: string | null }>) {
    // Resolve display height: static TS catalog → DB variant → DB type key
    // → 0. The type-key fallback mirrors the render enrich path
    // (api/world/objects) so tall dynamic objects with a null variant_id
    // still register as obstacles instead of being silently dropped.
    const staticH = OBJECT_CATALOG[r.type as PlazaObjectType]?.nativeHeightPct;
    const dynH = r.variant_id ? heightByVariant.get(r.variant_id) : undefined;
    const h = (staticH ?? dynH ?? heightByTypeKey.get(r.type) ?? 0) * (r.scale ?? 1);
    const radius = obstacleRadius(h);
    if (radius > 0) obstacles.push({ x: r.x, y: r.y, radius });
  }
  return obstacles;
}

export async function tickMemberPositions(
  sb: SupabaseClient,
  worldId: string,
): Promise<{ scattered: number; moved: number }> {
  const { data: world } = await sb
    .from("worlds")
    .select("owner_x, owner_y")
    .eq("id", worldId)
    .maybeSingle();
  const ownerPt = world
    ? { x: world.owner_x ?? 50, y: world.owner_y ?? 60 }
    : { x: 50, y: 60 };

  const { data: rows } = await sb
    .from("members")
    .select("id, x, y, flip, pos_updated_at, status, activated_at, activity_weight")
    .eq("current_location_world_id", worldId)
    .not("activated_at", "is", null)
    .eq("status", "active");
  if (!rows || rows.length === 0) return { scattered: 0, moved: 0 };
  const typed = rows as Row[];
  const obstacles = await buildObstacles(sb, worldId);

  // Snapshot of every CURRENT position so scatter + drift both avoid
  // collisions with everyone (not just the rows they'll touch).
  const positions: Array<{ id: string | null; x: number; y: number }> = [
    { id: null, x: ownerPt.x, y: ownerPt.y },
    ...typed.map((r) => ({
      id: r.id,
      x: typeof r.x === "number" ? r.x : 50,
      y: typeof r.y === "number" ? r.y : 60,
    })),
  ];

  // ── 1. Scatter uninitialized members ───────────────────────────
  let scattered = 0;
  for (const r of typed.filter(isUninitialized)) {
    // Avoid every OTHER position (incl. the owner avatar and every
    // already-placed member). For not-yet-moved siblings still in
    // `positions` at the default (50, 60), the pickClearSpot loop
    // naturally pushes them off the center because the first scattered
    // member updates the snapshot before the next one runs.
    const others = positions.filter((p) => p.id !== r.id);
    const spot = pickClearSpot(others, obstacles);
    const flip = spot.x > PLAZA_CENTER_X;
    const { error } = await sb
      .from("members")
      .update({
        x: spot.x,
        y: spot.y,
        flip,
        pos_updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (!error) {
      scattered++;
      // Mutate the local snapshot so subsequent iterations see this
      // member's NEW position, not the stale default.
      const idx = positions.findIndex((p) => p.id === r.id);
      if (idx >= 0) positions[idx] = { id: r.id, x: spot.x, y: spot.y };
    }
  }

  // ── 2. Drift eligible members ─────────────────────────────────
  const driftCandidates = typed.filter((r) => {
    if (isUninitialized(r)) return false; // already handled above
    if (r.activity_weight < 0.3) return false;
    const last = r.pos_updated_at ? new Date(r.pos_updated_at).getTime() : 0;
    return Date.now() - last >= PER_MEMBER_COOLDOWN_MS;
  });

  // Shuffle to randomise which subset moves this tick.
  for (let i = driftCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [driftCandidates[i], driftCandidates[j]] = [driftCandidates[j], driftCandidates[i]];
  }
  const movers = driftCandidates.slice(0, MAX_MOVERS_PER_TICK);

  let moved = 0;
  for (const m of movers) {
    const curX = typeof m.x === "number" ? m.x : 50;
    const curY = typeof m.y === "number" ? m.y : 60;
    // Sample a few step candidates and pick the one that lands clear
    // of neighbours. Fall back to the last try if everything's blocked,
    // so we don't ban movement in dense rooms.
    const others = positions.filter((p) => p.id !== m.id);
    let best = { x: curX, y: curY };
    let bestMinD = -1;
    for (let i = 0; i < 8; i++) {
      const dx = (Math.random() * 2 - 1) * MAX_DX;
      const dy = (Math.random() * 2 - 1) * MAX_DY;
      const nx = clamp(curX + dx, FLOOR_X_MIN, FLOOR_X_MAX);
      const ny = clamp(curY + dy, FLOOR_Y_MIN, FLOOR_Y_MAX);
      const cand = { x: nx, y: ny };
      if (!clearOfObstacles(cand, obstacles)) continue; // never drift into an object
      if (occludedBehind(cand, obstacles)) continue;    // nor behind a tall one
      const minD = others.length === 0
        ? Infinity
        : Math.min(...others.map((o) => isoDist(cand, o)));
      if (minD >= MIN_GAP) { best = cand; bestMinD = minD; break; }
      if (minD > bestMinD) { bestMinD = minD; best = cand; }
    }
    const flip = best.x < curX - 0.5
      ? true
      : best.x > curX + 0.5
        ? false
        : m.flip === true;
    const { error } = await sb
      .from("members")
      .update({
        x: best.x,
        y: best.y,
        flip,
        pos_updated_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    if (!error) {
      moved++;
      const idx = positions.findIndex((p) => p.id === m.id);
      if (idx >= 0) positions[idx] = { id: m.id, x: best.x, y: best.y };
    }
  }

  return { scattered, moved };
}
