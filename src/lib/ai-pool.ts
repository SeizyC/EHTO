// AI character pool — Option C (hybrid global identity).
//
//   · ensureAiPool:    upsert MEMBER_TEMPLATES into ai_characters by name.
//                      Idempotent. Call once at server boot or on first seed.
//   · pickAvailable:   return up to N characters with current active-room
//                      count below their max_concurrent_rooms, least-loaded
//                      first. Used by world-seed to populate a new world.
//
// Load counting is computed at read time (no cached counter column) to avoid
// drift across world deletes, status flips, and concurrent seeds.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MEMBER_TEMPLATES } from "@/lib/member-templates";

export type AiCharacter = {
  id: string;
  name: string;
  sprite: string;
  base_persona: { affinity?: string[]; speech_style?: string };
  base_backstory: string | null;
  default_activity_weight: number;
  max_concurrent_rooms: number;
};

let _poolEnsuredAt: number | null = null;
const POOL_TTL_MS = 5 * 60_000;

/** Upsert MEMBER_TEMPLATES into ai_characters. Idempotent on `name`. */
export async function ensureAiPool(sb: SupabaseClient): Promise<void> {
  if (_poolEnsuredAt && Date.now() - _poolEnsuredAt < POOL_TTL_MS) return;

  const rows = MEMBER_TEMPLATES.map((t) => ({
    name: t.name,
    sprite: t.sprite,
    base_persona: { affinity: t.affinity, speech_style: t.speech_style },
    base_backstory: t.backstory_seed,
    default_activity_weight: t.initial_weight,
  }));

  const { error } = await sb
    .from("ai_characters")
    .upsert(rows, { onConflict: "name", ignoreDuplicates: false });
  if (error) throw new Error(`ai_characters upsert: ${error.message}`);
  _poolEnsuredAt = Date.now();
}

/**
 * Pick up to `n` characters with spare capacity, least-loaded first.
 * "load" = count of non-ghost activated members rows for that ai_character.
 * Falls back to least-loaded overall if pool is saturated (capacity exceeded).
 */
export async function pickAvailable(
  sb: SupabaseClient,
  n: number,
): Promise<AiCharacter[]> {
  const { data: pool, error: pErr } = await sb
    .from("ai_characters")
    .select("id, name, sprite, base_persona, base_backstory, default_activity_weight, max_concurrent_rooms");
  if (pErr) throw new Error(`ai_characters read: ${pErr.message}`);
  if (!pool || pool.length === 0) return [];

  // One round-trip: pull all active member rows joined to ai_character ids.
  const { data: load } = await sb
    .from("members")
    .select("ai_character_id")
    .not("ai_character_id", "is", null)
    .not("activated_at", "is", null)
    .neq("status", "ghost");

  const counts = new Map<string, number>();
  for (const r of load ?? []) {
    if (!r.ai_character_id) continue;
    counts.set(r.ai_character_id, (counts.get(r.ai_character_id) ?? 0) + 1);
  }

  const scored = pool
    .map((c) => ({ c: c as AiCharacter, used: counts.get(c.id) ?? 0 }))
    .sort((a, b) => {
      // Has-capacity first, then least loaded, then random tiebreak (shuffle).
      const aCap = a.used < a.c.max_concurrent_rooms ? 0 : 1;
      const bCap = b.used < b.c.max_concurrent_rooms ? 0 : 1;
      if (aCap !== bCap) return aCap - bCap;
      if (a.used !== b.used) return a.used - b.used;
      return Math.random() - 0.5;
    });

  return scored.slice(0, n).map((s) => s.c);
}
