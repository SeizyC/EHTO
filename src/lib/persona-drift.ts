// Slow persona-affinity drift driven by implicit user preference.
//
// Once per 24h per world, this picks one eligible member and *maybe*
// appends a single new affinity tag (the user's top implicit topic) to
// their persona JSON. Members the user has @-mentioned recently are
// weighted toward being picked, so the room's "personality" drifts in
// the direction of who the user actually talks to.
//
// Hard caps:
//   · at most one append per day, world-wide (worlds.last_persona_drift_at)
//   · at most one append per member's affinity list (skip if topic
//     already present, skip if affinity already ≥ MAX_AFFINITY items)
//
// This is intentionally slow. The goal isn't "members suddenly love
// the user's hobby" — it's "two weeks in, the affinity tags read like
// the user's world, not the seed world".
//
// Design doc: docs/superpowers/specs/2026-05-31-implicit-preference-design.md

import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateImplicit } from "@/lib/implicit-pref";

const DRIFT_COOLDOWN_MS = 24 * 3600 * 1000;
const MAX_AFFINITY = 5;
const MENTION_BOOST_THRESHOLD = 0.5;

export type PersonaDriftResult = {
  drifted: { memberId: string; name: string; topic: string } | null;
  reason?: string;
};

type ActiveMember = {
  id: string;
  name: string;
  persona: { affinity?: string[] } | null;
  activity_weight: number;
};

export async function tickPersonaDrift(
  sb: SupabaseClient,
  worldId: string,
): Promise<PersonaDriftResult> {
  // Cooldown gate — worlds.last_persona_drift_at column was added in
  // the implicit-pref migration. Null means "never drifted yet".
  const { data: world } = await sb
    .from("worlds")
    .select("last_persona_drift_at")
    .eq("id", worldId)
    .maybeSingle();
  if (!world) return { drifted: null, reason: "no-world" };
  const lastIso = (world as { last_persona_drift_at?: string | null })
    .last_persona_drift_at ?? null;
  if (lastIso && Date.now() - new Date(lastIso).getTime() < DRIFT_COOLDOWN_MS) {
    return { drifted: null, reason: "cooldown" };
  }

  // Need a topic to add. Cold-start or empty signal → no-op.
  const implicit = await aggregateImplicit(sb, worldId);
  if (implicit.coldStart) return { drifted: null, reason: "cold-start" };
  const topTopic = implicit.topics[0]?.topic;
  if (!topTopic) return { drifted: null, reason: "no-topic" };

  // Active member pool. Same filter as the speaker pick + activity
  // floor so we don't drift dormant or about-to-leave members.
  const { data: rows } = await sb
    .from("members")
    .select("id, name, persona, activity_weight, status, activated_at")
    .eq("current_location_world_id", worldId)
    .not("activated_at", "is", null)
    .eq("status", "active");
  const pool = ((rows ?? []) as Array<ActiveMember & { status: string }>)
    .filter((m) => m.activity_weight >= 0.3);
  if (pool.length === 0) return { drifted: null, reason: "no-active-members" };

  // Drop anyone who already has this topic, or whose affinity is full.
  const eligible = pool.filter((m) => {
    const aff = m.persona?.affinity ?? [];
    if (aff.includes(topTopic)) return false;
    if (aff.length >= MAX_AFFINITY) return false;
    return true;
  });
  if (eligible.length === 0) return { drifted: null, reason: "all-saturated" };

  // Pick: mention-affinity weighted. Members the user has @-summoned
  // get 2× weight, baseline gets activity_weight. Soft enough that
  // non-mentioned members still drift sometimes — keeps the room
  // evolving even when the user hasn't @-mentioned anyone recently.
  const maxMention = Math.max(0, ...Array.from(implicit.mentions.values()));
  const weighted = eligible.map((m) => {
    const mention = implicit.mentions.get(m.id) ?? 0;
    const mentionNorm = maxMention > 0 ? mention / maxMention : 0;
    const boost = mentionNorm >= MENTION_BOOST_THRESHOLD ? 2 : 1;
    return { m, w: Math.max(0.05, m.activity_weight) * boost };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let pick = Math.random() * total;
  let chosen = weighted[0].m;
  for (const x of weighted) {
    pick -= x.w;
    if (pick <= 0) { chosen = x.m; break; }
  }

  const nextAffinity = [...(chosen.persona?.affinity ?? []), topTopic];
  const nextPersona = { ...(chosen.persona ?? {}), affinity: nextAffinity };

  const { error } = await sb
    .from("members")
    .update({ persona: nextPersona })
    .eq("id", chosen.id);
  if (error) return { drifted: null, reason: `update-fail: ${error.message}` };

  await sb.from("worlds")
    .update({ last_persona_drift_at: new Date().toISOString() })
    .eq("id", worldId);

  console.log(`[persona-drift] ${chosen.name} ← "${topTopic}" (affinity now: ${nextAffinity.join(", ")})`);
  return {
    drifted: { memberId: chosen.id, name: chosen.name, topic: topTopic },
  };
}
