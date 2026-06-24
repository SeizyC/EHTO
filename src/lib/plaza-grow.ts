// Director: grows the plaza over time. Each world starts with a 2-piece
// starter set (planter + bench) and earns new objects as it accumulates
// days + messages. Stages advance monotonically — `worlds.plaza_growth_stage`
// tracks the highest milestone reached, so a tick after a restart picks
// up where it left off and never double-places.
//
// Milestone gating uses BOTH (age in days) and (total message count) so
// a freshly-seeded world that's only an hour old doesn't immediately
// hit "month 1" just because the user spammed messages. Each milestone
// fires once across the world's lifetime.

import type { SupabaseClient } from "@supabase/supabase-js";
import { OBJECT_CATALOG, type PlazaObjectType } from "@/lib/plaza-objects";
import { aggregateImplicit } from "@/lib/implicit-pref";
import { catalogAll, catalogByTypeKey, pickRandomVariant, type ObjectType } from "@/lib/object-catalog";
import { tryGenerateDynamicType, tryGenerateVariant } from "@/lib/dynamic-object-gen";

// Depth bands (taxonomy spec §3). Placement y is clamped into the band so
// a milestone's slot can never escape its layer: buildings sit at the back
// (behind characters via PlazaCanvas's y-sort), landmarks mid, props/pets
// up front where people roam.
type Band = "back" | "mid" | "front";
type Tier = "prop" | "landmark" | "building" | "pet";
const BAND_Y: Record<Band, [number, number]> = {
  back: [44, 54],   // building band — sits on the back of the floor, not the sky
  mid: [56, 68],    // landmark band
  front: [70, 86],  // prop / pet / people band
};
// Representative size (native_height_pct) per tier — used when matching
// curated catalog objects / driving generation for a slot, replacing the
// old "size derived from the static default type" approach.
const HEIGHT_BY_TIER: Record<Tier, number> = { prop: 14, landmark: 32, building: 60, pet: 4.5 };
// Minimum horizontal gap (in x%) between two objects sharing a band, sized to
// each tier's visual footprint so same-layer objects never overlap. Buildings
// are widest.
const OBJECT_GAP_BY_TIER: Record<Tier, number> = { prop: 9, landmark: 14, building: 22, pet: 7 };
const FLOOR_X_MIN = 8;
const FLOOR_X_MAX = 92;

/** Pick an x in the floor band that's ≥ gap from every occupied x, nearest to
 *  the preferred x. Returns the preferred x if it's already clear, or null if
 *  the band is too crowded to fit. */
function clearX(preferred: number, occupied: number[], gap: number): number | null {
  const clearAt = (x: number) => occupied.every((ox) => Math.abs(ox - x) >= gap);
  if (clearAt(preferred)) return preferred;
  // Spiral outward from the preferred x in 2% steps, staying in bounds.
  for (let d = 2; d <= FLOOR_X_MAX - FLOOR_X_MIN; d += 2) {
    for (const cand of [preferred - d, preferred + d]) {
      if (cand >= FLOOR_X_MIN && cand <= FLOOR_X_MAX && clearAt(cand)) return cand;
    }
  }
  return null;
}
function clampToBand(y: number, band: Band): number {
  const [lo, hi] = BAND_Y[band];
  return Math.min(hi, Math.max(lo, y));
}
// "Special building" gate (spec §4): the back slot is the biggest, most
// expensive piece, so it only fills when the user's top implicit topic is
// strong/persistent. Below this it stays empty (the skyline fills the back
// once that layer ships). Tunable.
const T_BUILDING = 2;
function passesBuildingGate(topTopicWeight: number): boolean {
  return topTopicWeight >= T_BUILDING;
}

type Milestone = {
  /** 1-based stage number, monotonic. */
  stage: number;
  /** Minimum days since world creation (KST clock-agnostic, naive elapsed). */
  daysMin: number;
  /** Minimum cumulative message count in the world. */
  messagesMin: number;
  /** Depth band (render layer + y clamp) and category tier this slot accepts. */
  band: Band;
  tier: Tier;
  /** Slot placement. `type` is the static default for prop/landmark/pet
   *  milestones; building slots omit it (they fill only from curated
   *  catalog / generation, gated by topic strength). */
  place: { type?: PlazaObjectType; x: number; y: number; scale?: number };
  /** Optional alternates with the same placement size. When set AND
   *  implicit preferences have any signal, we pick from
   *  [place.type, ...alternates] weighted by catalog topic overlap.
   *  Used for the dog stages so the user's recent thread chooses the
   *  next pet. Architectural stages (fountain/lamp/tree) intentionally
   *  leave this empty — their positions and sizes are fixed. */
  alternates?: PlazaObjectType[];
};

// Layout note: y values stay inside the floor band (42–80) and x values
// pick spots that don't collide with the starter set (planter at 22/78,
// bench at 75/84).
const MILESTONES: Milestone[] = [
  {
    stage: 1,
    daysMin: 3, messagesMin: 50,
    band: "mid", tier: "landmark",
    place: { type: "fountain", x: 50, y: 58, scale: 0.95 },
  },
  {
    stage: 2,
    daysMin: 7, messagesMin: 200,
    band: "mid", tier: "landmark",
    place: { type: "lamp", x: 82, y: 54 },
  },
  {
    stage: 3,
    daysMin: 14, messagesMin: 500,
    band: "mid", tier: "landmark",
    place: { type: "tree", x: 16, y: 53 },
  },
  {
    stage: 4,
    daysMin: 30, messagesMin: 1000,
    band: "front", tier: "prop",
    place: { type: "planter", x: 62, y: 76 },
  },
  {
    stage: 5,
    daysMin: 60, messagesMin: 2500,
    band: "mid", tier: "landmark",
    place: { type: "tree", x: 88, y: 64, scale: 0.9 },
  },
  // Dogs — add warmth/playfulness on top of the architectural objects.
  // Spaced tighter than the building stages (7d → 13d → 25d) because
  // each new dog brings small diversity, not a new landmark, so the
  // reward cadence can be quicker without crowding.
  // Dog stages list the OTHER three breeds as alternates so when a
  // milestone fires, the user's implicit topics can swap which dog
  // shows up. A user who's been talking '쉼' often gets the sleeping
  // retriever first; '활기'-heavy users get the shiba. All dogs share
  // the placement geometry, so the swap is purely cosmetic.
  {
    stage: 6,
    daysMin: 5, messagesMin: 120,
    band: "front", tier: "pet",
    place: { type: "dog_shiba", x: 35, y: 78 },
    alternates: ["dog_maltese", "dog_retriever", "dog_dachshund"],
  },
  {
    stage: 7,
    daysMin: 12, messagesMin: 380,
    band: "front", tier: "pet",
    place: { type: "dog_maltese", x: 48, y: 73 },
    alternates: ["dog_shiba", "dog_retriever", "dog_dachshund"],
  },
  {
    stage: 8,
    daysMin: 25, messagesMin: 720,
    band: "front", tier: "pet",
    place: { type: "dog_retriever", x: 22, y: 76 },
    alternates: ["dog_shiba", "dog_maltese", "dog_dachshund"],
  },
  {
    stage: 9,
    daysMin: 50, messagesMin: 1700,
    band: "front", tier: "pet",
    place: { type: "dog_dachshund", x: 70, y: 75 },
    alternates: ["dog_shiba", "dog_maltese", "dog_retriever"],
  },
  // Special building (back band). No static default — fills only from a
  // topic-matched curated/generated building, and only when the user's top
  // implicit topic is strong enough (passesBuildingGate). Until then the
  // back slot is held empty. Two slots flank the back so a town can grow a
  // small skyline of its own as topics persist.
  {
    stage: 10,
    daysMin: 14, messagesMin: 400,
    band: "back", tier: "building",
    place: { x: 30, y: 44, scale: 1.0 },
  },
  {
    stage: 11,
    daysMin: 45, messagesMin: 1400,
    band: "back", tier: "building",
    place: { x: 68, y: 46, scale: 1.0 },
  },
];

const DAY_MS = 24 * 3600_000;

export type PlazaGrowResult = {
  advanced: number[];
  placed: PlazaObjectType[];
};

export async function tickPlazaGrowth(
  sb: SupabaseClient,
  worldId: string,
): Promise<PlazaGrowResult> {
  const { data: world } = await sb
    .from("worlds")
    .select("created_at, plaza_growth_stage, owner_id, last_dynamic_gen_at")
    .eq("id", worldId)
    .maybeSingle();
  if (!world) return { advanced: [], placed: [] };

  const ageMs = Date.now() - new Date(world.created_at as string).getTime();
  const days = ageMs / DAY_MS;

  // Cheap exact count of messages — done once per tick. With realistic
  // worlds (≤ tens of thousands of rows), HEAD count is instant.
  const { count: msgCount } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("world_id", worldId);
  const messages = msgCount ?? 0;

  let stage = (world.plaza_growth_stage as number | null) ?? 0;
  const advanced: number[] = [];
  const placed: PlazaObjectType[] = [];

  // Implicit topics (cached) — used to weight alternates when a
  // milestone has them. Cheap call after the first hit per tick.
  const implicit = await aggregateImplicit(sb, worldId);
  const implicitTopicMap = new Map<string, number>();
  for (const t of implicit.topics) implicitTopicMap.set(t.topic, t.weight);

  // Owner's mute list — every type_id the user dismissed from
  // RoomInfoSheet. plaza-grow refuses to re-place a muted type. Look
  // up by owner so this works even though the tick runs under the
  // service client.
  const { data: muteRows } = await sb
    .from("user_object_mutes")
    .select("type_id")
    .eq("user_id", world.owner_id)
    .eq("world_id", worldId);
  const mutedTypeIds = new Set<string>((muteRows ?? []).map((r) => (r as { type_id: string }).type_id));

  // Dynamic-gen daily quota — only one new dynamic type per world per
  // 24h, in addition to the global dedup in tryGenerateDynamicType.
  const lastDynIso = (world as { last_dynamic_gen_at?: string | null }).last_dynamic_gen_at ?? null;
  const dynQuotaAvailable = !lastDynIso
    || Date.now() - new Date(lastDynIso).getTime() > 24 * 3600_000;

  // Korean object labels — pull from the catalog so this doesn't drift
  // when new object types are added.
  const labels = Object.fromEntries(
    (Object.entries(OBJECT_CATALOG) as Array<[PlazaObjectType, { label: string }]>)
      .map(([k, v]) => [k, v.label]),
  ) as Record<PlazaObjectType, string>;

  // Advance through any milestones whose gates have BOTH been met.
  for (const m of MILESTONES) {
    if (m.stage <= stage) continue;
    if (days < m.daysMin || messages < m.messagesMin) break;

    // Building tier is gated + has no static default. Hold the back slot
    // empty until the user's top implicit topic is strong/persistent enough
    // (a town doesn't sprout a café on day one). The skyline layer fills the
    // back visually, so an empty slot reads fine.
    const isBuilding = m.tier === "building";
    if (isBuilding && !passesBuildingGate(implicit.topics[0]?.weight ?? 0)) {
      console.log(`[plaza-grow] stage ${m.stage} building slot held (top topic < ${T_BUILDING})`);
      break;
    }

    // Pick the type key for this slot:
    //   1. Static default (+ topic-weighted alternates) — prop/landmark/pet.
    //   2. Curated catalog object whose category===tier and topics overlap.
    //   3. Runtime generation (tier-guided) when the daily quota is open.
    // Building has no step-1 default, so it relies on 2/3 (else holds).
    const tierMeta = { category: m.tier as ObjectType["category"], heightPct: HEIGHT_BY_TIER[m.tier] };
    let chosenTypeKey: string | null = isBuilding ? null : m.place.type!;
    if (!isBuilding && m.alternates) {
      chosenTypeKey = pickByTopicOverlap([m.place.type!, ...m.alternates], implicitTopicMap, m.place.type!);
    }
    // "Still on the slot default" — the point at which a topic-matched
    // curated/generated object is allowed to take over.
    const atDefault = () => (isBuilding ? chosenTypeKey === null : chosenTypeKey === m.place.type);

    if (atDefault() && implicit.topics.length > 0) {
      const catalog = await catalogAll(sb);
      const curated = selectCuratedForSlot(catalog, tierMeta, implicitTopicMap, mutedTypeIds);
      if (curated) chosenTypeKey = curated.typeKey;
    }

    if (atDefault() && implicit.topics.length > 0 && dynQuotaAvailable) {
      const dyn = await tryGenerateDynamicType(sb, {
        topic: implicit.topics[0].topic,
        slotHeightPct: tierMeta.heightPct,
        slotTopics: [],
        category: tierMeta.category,
      });
      if (dyn) {
        chosenTypeKey = dyn.typeKey;
        // Stamp the daily quota only on a successful gen so failed
        // attempts can retry later in the same window.
        await sb.from("worlds")
          .update({ last_dynamic_gen_at: new Date().toISOString() })
          .eq("id", worldId);
      }
    }

    // Building slot with no topic-matched fill → hold it (don't advance);
    // a future tick retries once a matching building exists.
    if (chosenTypeKey === null) {
      console.log(`[plaza-grow] stage ${m.stage} building slot empty (no match) — hold`);
      break;
    }

    // Resolve catalog row + skip if the user has muted this type.
    const type = await catalogByTypeKey(sb, chosenTypeKey);
    if (!type) {
      console.warn(`[plaza-grow] catalog miss for "${chosenTypeKey}" stage ${m.stage} — skip`);
      break;
    }
    if (mutedTypeIds.has(type.id)) {
      console.log(`[plaza-grow] stage ${m.stage} skipped: type "${chosenTypeKey}" is muted`);
      // Skip ahead to the next milestone candidate by faking advance
      // — the user explicitly rejected this type so we don't keep
      // retrying on every poll.
      const { error: updErr } = await sb.from("worlds")
        .update({ plaza_growth_stage: m.stage }).eq("id", worldId);
      if (!updErr) stage = m.stage;
      continue;
    }
    const variant = pickRandomVariant(type);
    if (!variant) {
      console.warn(`[plaza-grow] no variants for "${chosenTypeKey}" stage ${m.stage} — skip`);
      break;
    }

    const placeY = clampToBand(m.place.y, m.band);
    // Same-layer overlap avoidance: nudge x off any object already standing in
    // this band so two objects in the same layer never sit on top of each
    // other. If the band is full, hold the slot for a later tick.
    const [bandLo, bandHi] = BAND_Y[m.band];
    const { data: bandObjs } = await sb
      .from("plaza_objects")
      .select("x")
      .eq("world_id", worldId)
      .gte("y", bandLo - 3)
      .lte("y", bandHi + 3);
    const placeX = clearX(
      m.place.x,
      (bandObjs ?? []).map((o) => (o as { x: number }).x),
      OBJECT_GAP_BY_TIER[m.tier],
    );
    if (placeX === null) {
      console.log(`[plaza-grow] stage ${m.stage} ${m.tier} band full — hold`);
      break;
    }

    // Place the object first, then bump the stage. If the insert fails
    // we don't advance — the next tick will retry the same milestone.
    const { error: insErr } = await sb.from("plaza_objects").insert({
      world_id: worldId,
      type: chosenTypeKey,          // legacy column for compatibility
      variant_id: variant.id,
      x: placeX,
      // Clamp into the slot's depth band so a slot can never escape its
      // render layer (buildings stay at the back, behind people).
      y: placeY,
      scale: m.place.scale ?? 1.0,
    });
    if (insErr) {
      console.warn(`[plaza-grow] insert failed for stage ${m.stage}:`, insErr.message);
      break;
    }
    // Atomic usage_count increment via SQL RPC. Fire-and-forget the
    // lazy variant generation if this type is getting popular.
    await sb.rpc("increment_type_usage", { p_type_id: type.id });
    const usagePerVariant = (type.usageCount + 1) / type.variants.length;
    if (usagePerVariant > 5 && type.variants.length < 5) {
      void tryGenerateVariant(sb, type.id);
    }
    const { error: updErr } = await sb
      .from("worlds")
      .update({ plaza_growth_stage: m.stage })
      .eq("id", worldId);
    if (updErr) {
      console.warn(`[plaza-grow] stage update failed:`, updErr.message);
      break;
    }
    // System notice so the user actually notices the new object — the
    // sprite alone is easy to miss if the user is scrolling chat.
    const label = type.labelKo
      ?? labels[chosenTypeKey as PlazaObjectType]
      ?? chosenTypeKey;
    await sb.from("messages").insert({
      world_id: worldId,
      kind: "system",
      text: `광장에 ${label}이(가) 생겼어요`,
    });
    stage = m.stage;
    advanced.push(m.stage);
    // `placed` retains the legacy PlazaObjectType[] for the return
    // shape; dynamic types fall back to the milestone default key for
    // log purposes since they aren't enum members.
    placed.push((chosenTypeKey in OBJECT_CATALOG ? chosenTypeKey : (m.place.type ?? chosenTypeKey)) as PlazaObjectType);
    console.log(
      `[plaza-grow] world ${worldId.slice(0, 8)} → stage ${m.stage} ${m.tier}/${m.band} (${chosenTypeKey}${m.place.type && chosenTypeKey !== m.place.type ? ` swap from ${m.place.type}` : ""})`,
    );
  }

  return { advanced, placed };
}

/** Choose the best curated catalog object for a milestone slot, or null.
 *  Filters by category + size band + not-muted, scores by implicit topic
 *  overlap, requires a positive score (no signal → caller keeps static pick). */
export function selectCuratedForSlot(
  catalog: ObjectType[],
  slot: { category: ObjectType["category"]; heightPct: number },
  topicWeights: Map<string, number>,
  mutedTypeIds: Set<string>,
): ObjectType | null {
  const lo = slot.heightPct * 0.6;
  const hi = slot.heightPct * 1.6;
  let best: ObjectType | null = null;
  let bestScore = 0;
  for (const t of catalog) {
    if (t.category !== slot.category) continue;
    if (t.variants.length === 0) continue;
    if (mutedTypeIds.has(t.id)) continue;
    if (t.nativeHeightPct < lo || t.nativeHeightPct > hi) continue;
    let score = 0;
    for (const tp of t.topics) score += topicWeights.get(tp) ?? 0;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore > 0 ? best : null;
}

/** Weighted pick across `candidates` by catalog topic overlap with the
 *  user's implicit topic weight map. When no candidate scores > 0
 *  (e.g. cold-start or all alternates have empty topics) we fall back
 *  to `fallback` so behaviour is identical to the pre-implicit code
 *  path. The fallback bonus is small (+0.3) so any real overlap from
 *  another candidate still wins — implicit is a soft nudge, not a
 *  hard override of the milestone author's intent. */
function pickByTopicOverlap(
  candidates: PlazaObjectType[],
  topicWeights: Map<string, number>,
  fallback: PlazaObjectType,
): PlazaObjectType {
  const scored = candidates.map((type) => {
    const topics = OBJECT_CATALOG[type].topics ?? [];
    let score = 0;
    for (const t of topics) score += topicWeights.get(t) ?? 0;
    if (type === fallback) score += 0.3;
    return { type, score };
  });
  const total = scored.reduce((s, x) => s + Math.max(0, x.score), 0);
  if (total <= 0) return fallback;
  let pick = Math.random() * total;
  for (const x of scored) {
    pick -= Math.max(0, x.score);
    if (pick <= 0) return x.type;
  }
  return fallback;
}
