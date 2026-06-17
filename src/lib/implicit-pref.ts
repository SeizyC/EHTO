// Implicit preference aggregate — reads user_signals + user_topic_mutes
// for a world, applies the 7-day exponential decay, drops muted topics,
// and returns the top-N topic list + per-member mention scores.
//
// Five consumers (ambient-loop / news-fetch / plaza-grow / persona-drift
// / youtube-share) call aggregateImplicit(sb, worldId) and treat the
// shape uniformly. Cold-start (account < 3 days) makes us return an
// empty result so every consumer falls through to its prior behavior.
//
// Design doc: docs/superpowers/specs/2026-05-31-implicit-preference-design.md

import type { SupabaseClient } from "@supabase/supabase-js";

const HALF_LIFE_MS = 7 * 24 * 3600 * 1000;
const COLD_START_MS = 3 * 24 * 3600 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const TOP_TOPICS = 5;
// Match the visible transparency panel — anything below this never
// reaches a consumer either. Keeps "barely seen once" noise out.
const MIN_TOPIC_WEIGHT = 0.5;

export type TopicEntry = { topic: string; weight: number };

export type ImplicitState = {
  topics: TopicEntry[];
  /** memberId → raw decayed mention sum. Consumers should normalise
   *  against the max before applying (see ambient-loop speaker boost). */
  mentions: Map<string, number>;
  /** True when the account is younger than COLD_START_MS. In that case
   *  topics/mentions are forced empty so all five application sites
   *  short-circuit to their prior behavior automatically. */
  coldStart: boolean;
};

const EMPTY_STATE: ImplicitState = {
  topics: [],
  mentions: new Map(),
  coldStart: true,
};

type CacheEntry = { at: number; state: ImplicitState };
const _cache = new Map<string, CacheEntry>();

/** Drop a world's cache. Called after a mute toggle so the panel + the
 *  five consumers reflect the new state on the next read. */
export function invalidateImplicit(worldId: string): void {
  _cache.delete(worldId);
}

function decayWeight(weight: number, ageMs: number): number {
  return weight * Math.exp((-ageMs / HALF_LIFE_MS) * Math.LN2);
}

/** Pull all relevant signals + mutes for a world and produce the live
 *  aggregate. Cached per-world for CACHE_TTL_MS so the ambient tick's
 *  poll cycle doesn't hit Supabase every 8 seconds. */
export async function aggregateImplicit(
  sb: SupabaseClient,
  worldId: string,
): Promise<ImplicitState> {
  const cached = _cache.get(worldId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.state;
  }

  // Identify the world owner — needed for both the cold-start gate
  // (account age) and the mute lookup.
  const { data: world } = await sb
    .from("worlds")
    .select("owner_id")
    .eq("id", worldId)
    .maybeSingle();
  if (!world?.owner_id) {
    _cache.set(worldId, { at: Date.now(), state: EMPTY_STATE });
    return EMPTY_STATE;
  }
  const ownerId = world.owner_id as string;

  // Cold-start gate: auth.users.created_at, accessed via the auth admin
  // surface. Service-role required (the calling site already runs with
  // service client per existing pattern in ambient-loop / plaza-grow).
  const { data: ownerAuth } = await sb.auth.admin.getUserById(ownerId);
  const createdAt = ownerAuth.user?.created_at;
  const ageMs = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
  if (ageMs < COLD_START_MS) {
    _cache.set(worldId, { at: Date.now(), state: EMPTY_STATE });
    return EMPTY_STATE;
  }

  // Fetch signals + mutes. We pull ALL signals for the world rather
  // than time-windowing here: the decay handles age, and reading older
  // rows is cheap with the (world_id, created_at desc) index. Capping
  // at 2000 rows protects against worst-case noise without losing the
  // long tail.
  const [{ data: sigs }, { data: mutes }] = await Promise.all([
    sb.from("user_signals")
      .select("kind, topic_keyword, target_member_id, weight, created_at")
      .eq("world_id", worldId)
      .order("created_at", { ascending: false })
      .limit(2000),
    sb.from("user_topic_mutes")
      .select("topic_keyword")
      .eq("world_id", worldId)
      .eq("user_id", ownerId),
  ]);

  const mutedSet = new Set<string>();
  for (const m of mutes ?? []) {
    const t = (m as { topic_keyword?: string }).topic_keyword;
    if (t) mutedSet.add(t);
  }

  const now = Date.now();
  const topicWeights = new Map<string, number>();
  const mentionWeights = new Map<string, number>();

  for (const s of (sigs ?? []) as Array<{
    kind: string;
    topic_keyword: string | null;
    target_member_id: string | null;
    weight: number;
    created_at: string;
  }>) {
    const age = now - new Date(s.created_at).getTime();
    const decayed = decayWeight(s.weight, age);
    // Once a signal has decayed below half the floor, every older one
    // has too (rows are ordered desc) — bail out to skip the rest.
    if (decayed < MIN_TOPIC_WEIGHT / 2) break;

    if (s.kind === "chat") {
      const t = s.topic_keyword;
      if (!t || mutedSet.has(t)) continue;
      topicWeights.set(t, (topicWeights.get(t) ?? 0) + decayed);
    } else if (s.kind === "mention") {
      const m = s.target_member_id;
      if (!m) continue;
      mentionWeights.set(m, (mentionWeights.get(m) ?? 0) + decayed);
    }
  }

  const topics: TopicEntry[] = Array.from(topicWeights.entries())
    .filter(([, w]) => w >= MIN_TOPIC_WEIGHT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TOPICS)
    .map(([topic, weight]) => ({ topic, weight }));

  const state: ImplicitState = {
    topics,
    mentions: mentionWeights,
    coldStart: false,
  };
  _cache.set(worldId, { at: Date.now(), state });
  return state;
}

/** Convenience: just the top topic name (or null). Used by news-fetch
 *  cache key construction + youtube-share fallback. */
export function topImplicitTopic(state: ImplicitState): string | null {
  return state.topics[0]?.topic ?? null;
}
