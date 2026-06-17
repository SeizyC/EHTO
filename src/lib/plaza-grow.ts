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
import { catalogByTypeKey, pickRandomVariant } from "@/lib/object-catalog";
import { tryGenerateDynamicType, tryGenerateVariant } from "@/lib/dynamic-object-gen";

type Milestone = {
  /** 1-based stage number, monotonic. */
  stage: number;
  /** Minimum days since world creation (KST clock-agnostic, naive elapsed). */
  daysMin: number;
  /** Minimum cumulative message count in the world. */
  messagesMin: number;
  /** Object to place when this stage advances. */
  place: { type: PlazaObjectType; x: number; y: number; scale?: number };
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
    place: { type: "fountain", x: 50, y: 60, scale: 0.95 },
  },
  {
    stage: 2,
    daysMin: 7, messagesMin: 200,
    place: { type: "lamp", x: 82, y: 56 },
  },
  {
    stage: 3,
    daysMin: 14, messagesMin: 500,
    place: { type: "tree", x: 16, y: 52 },
  },
  {
    stage: 4,
    daysMin: 30, messagesMin: 1000,
    place: { type: "planter", x: 62, y: 76 },
  },
  {
    stage: 5,
    daysMin: 60, messagesMin: 2500,
    place: { type: "tree", x: 88, y: 72, scale: 0.9 },
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
    place: { type: "dog_shiba", x: 35, y: 78 },
    alternates: ["dog_maltese", "dog_retriever", "dog_dachshund"],
  },
  {
    stage: 7,
    daysMin: 12, messagesMin: 380,
    place: { type: "dog_maltese", x: 48, y: 73 },
    alternates: ["dog_shiba", "dog_retriever", "dog_dachshund"],
  },
  {
    stage: 8,
    daysMin: 25, messagesMin: 720,
    place: { type: "dog_retriever", x: 22, y: 76 },
    alternates: ["dog_shiba", "dog_maltese", "dog_dachshund"],
  },
  {
    stage: 9,
    daysMin: 50, messagesMin: 1700,
    place: { type: "dog_dachshund", x: 70, y: 75 },
    alternates: ["dog_shiba", "dog_maltese", "dog_retriever"],
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

    // Pick the actual type key.
    //   1. Static alternates weighted by implicit topic overlap.
    //   2. If we landed on the milestone default AND implicit has a
    //      hot topic AND the world's daily dynamic quota is open,
    //      try generating a brand-new type for this slot. While the
    //      OpenAI gate is closed (lib/dynamic-object-gen.ts) this is
    //      a guaranteed null — flow falls back to the static pick.
    const staticCandidates: PlazaObjectType[] = m.alternates
      ? [m.place.type, ...m.alternates]
      : [m.place.type];
    let chosenTypeKey: string = staticCandidates.length === 1
      ? m.place.type
      : pickByTopicOverlap(staticCandidates, implicitTopicMap, m.place.type);

    if (
      chosenTypeKey === m.place.type &&
      implicit.topics.length > 0 &&
      dynQuotaAvailable
    ) {
      const meta = OBJECT_CATALOG[m.place.type];
      const dyn = await tryGenerateDynamicType(sb, {
        topic: implicit.topics[0].topic,
        slotHeightPct: meta.nativeHeightPct,
        slotTopics: meta.topics ?? [],
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

    // Place the object first, then bump the stage. If the insert fails
    // we don't advance — the next tick will retry the same milestone.
    const { error: insErr } = await sb.from("plaza_objects").insert({
      world_id: worldId,
      type: chosenTypeKey,          // legacy column for compatibility
      variant_id: variant.id,
      x: m.place.x,
      y: m.place.y,
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
    placed.push((chosenTypeKey in OBJECT_CATALOG ? chosenTypeKey : m.place.type) as PlazaObjectType);
    console.log(
      `[plaza-grow] world ${worldId.slice(0, 8)} → stage ${m.stage} (${chosenTypeKey}${chosenTypeKey !== m.place.type ? ` swap from ${m.place.type}` : ""})`,
    );
  }

  return { advanced, placed };
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
