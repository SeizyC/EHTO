import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlazaObject, PlazaObjectType } from "@/lib/plaza-objects";

// Starter set placed on a world's first plaza fetch. Two pieces only so
// the early days feel "lived-in but sparse" — the Director will accumulate
// the rest over time (more planters as activity grows, a fountain after
// the first week, etc.). Kept tiny because a plaza of strangers shouldn't
// look like a furnished apartment on day one — that's the loneliness cue
// the entire app is responding to.
//
// Coordinates match the PLAZA_PRESETS.trickle layout convention: bottom-
// center anchored, x/y as % of container.
const STARTER: Omit<PlazaObject, "id">[] = [
  { type: "planter", x: 22, y: 78 },
  { type: "bench",   x: 75, y: 84, scale: 0.95 },
];

export async function seedPlazaObjectsIfEmpty(
  sb: SupabaseClient,
  worldId: string,
): Promise<{ seeded: number }> {
  const { data: existing, error: countErr } = await sb
    .from("plaza_objects")
    .select("id")
    .eq("world_id", worldId)
    .limit(1);
  if (countErr) {
    console.warn("[plaza-seed] count failed:", countErr.message);
    return { seeded: 0 };
  }
  if ((existing?.length ?? 0) > 0) return { seeded: 0 };

  const rows = STARTER.map((o) => ({
    world_id: worldId,
    type: o.type,
    x: o.x,
    y: o.y,
    scale: o.scale ?? 1.0,
  }));
  const { error } = await sb.from("plaza_objects").insert(rows);
  if (error) {
    console.warn("[plaza-seed] insert failed:", error.message);
    return { seeded: 0 };
  }
  console.log(`[plaza-seed] seeded ${rows.length} starter objects for ${worldId}`);
  return { seeded: rows.length };
}

// Plant a single object at runtime — used by the Director to grow the
// plaza when activity thresholds trigger. Type is validated against the
// 5-kind catalog; bad input is silently rejected to keep the LLM-driven
// caller safe.
const VALID_TYPES: PlazaObjectType[] = ["fountain", "bench", "planter", "lamp", "tree"];

export async function placePlazaObject(
  sb: SupabaseClient,
  worldId: string,
  spec: Omit<PlazaObject, "id">,
): Promise<{ ok: boolean; reason?: string }> {
  if (!VALID_TYPES.includes(spec.type as PlazaObjectType)) return { ok: false, reason: `bad-type:${spec.type}` };
  if (spec.x < 0 || spec.x > 100 || spec.y < 0 || spec.y > 100) {
    return { ok: false, reason: "out-of-bounds" };
  }
  const { error } = await sb.from("plaza_objects").insert({
    world_id: worldId,
    type: spec.type,
    x: spec.x,
    y: spec.y,
    scale: spec.scale ?? 1.0,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
