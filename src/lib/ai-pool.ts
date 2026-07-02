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
import { MEMBER_TEMPLATES, nameI18nFor } from "@/lib/member-templates";
import type { MemberProfile, MemberRegion } from "@/lib/member-templates";

export type NameI18n = { ko: string; en: string; ja: string };

export type AiCharacter = {
  id: string;
  name: string;
  sprite: string;
  region: MemberRegion;
  base_persona: { affinity?: string[]; speech_style?: string; profile?: MemberProfile };
  base_backstory: string | null;
  default_activity_weight: number;
  max_concurrent_rooms: number;
  name_i18n: NameI18n | null;
};

const POOL_COLS =
  "id, name, sprite, region, base_persona, base_backstory, default_activity_weight, max_concurrent_rooms, name_i18n";

let _poolEnsuredAt: number | null = null;
const POOL_TTL_MS = 5 * 60_000;

/** Upsert MEMBER_TEMPLATES into ai_characters. Idempotent on `name`. */
export async function ensureAiPool(sb: SupabaseClient): Promise<void> {
  if (_poolEnsuredAt && Date.now() - _poolEnsuredAt < POOL_TTL_MS) return;

  const rows = MEMBER_TEMPLATES.map((t) => ({
    name: t.name,
    sprite: t.sprite,
    region: t.region,
    base_persona: { affinity: t.affinity, speech_style: t.speech_style, profile: t.profile },
    base_backstory: t.backstory_seed,
    default_activity_weight: t.initial_weight,
    name_i18n: nameI18nFor(t.name),
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
 *
 * When `region` is given, the roster is mixed to feel locally grounded:
 * ~75-85% from that region + ~15-25% GLOBAL (migrants/nomads). If the local
 * pool runs short, the remainder is filled from GLOBAL, then anywhere.
 */
export async function pickAvailable(
  sb: SupabaseClient,
  n: number,
  region?: MemberRegion,
): Promise<AiCharacter[]> {
  const { data: pool, error: pErr } = await sb
    .from("ai_characters")
    .select(POOL_COLS);
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

  // Least-loaded-first ordering (has-capacity, then least used, then shuffle).
  const order = (arr: AiCharacter[]): AiCharacter[] =>
    arr
      .map((c) => ({ c, used: counts.get(c.id) ?? 0 }))
      .sort((a, b) => {
        const aCap = a.used < a.c.max_concurrent_rooms ? 0 : 1;
        const bCap = b.used < b.c.max_concurrent_rooms ? 0 : 1;
        if (aCap !== bCap) return aCap - bCap;
        if (a.used !== b.used) return a.used - b.used;
        return Math.random() - 0.5;
      })
      .map((s) => s.c);

  const all = pool as AiCharacter[];

  // No region → legacy behaviour: least-loaded overall.
  if (!region) return order(all).slice(0, n);

  // Region-aware mix. GLOBAL region worlds are already "global", so no split.
  const globalTarget = region === "GLOBAL" ? n : Math.max(1, Math.round(n * 0.2));
  const localTarget = Math.max(0, n - globalTarget);

  const localPool = order(all.filter((c) => c.region === region));
  const globalPool = order(all.filter((c) => c.region === "GLOBAL"));

  const chosen: AiCharacter[] = [];
  const taken = new Set<string>();
  const take = (list: AiCharacter[], k: number) => {
    for (const c of list) {
      if (chosen.length >= n || k <= 0) break;
      if (taken.has(c.id)) continue;
      chosen.push(c); taken.add(c.id); k--;
    }
  };

  take(localPool, localTarget);
  take(globalPool, globalTarget);
  // Backfill any shortfall: remaining locals, then remaining globals, then anyone.
  take(localPool, n - chosen.length);
  take(globalPool, n - chosen.length);
  take(order(all), n - chosen.length);

  return chosen.slice(0, n);
}
