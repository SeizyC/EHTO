// Member rotation: who stays, who leaves, who replaces them.
//
// Long-tail concept: a room is a living small society, not a static cast.
// Members that've gone quiet for days drift away ("이만 갈게..."), and the
// global ai_characters pool refills the slot with a new dormant member
// scheduled to arrive 12–24h later. The same ai_character may show up in
// another world too — that's the "이동(migration)" implicit in Option C.
//
// Called from the ambient cron tick. Stays cheap on every invocation: only
// fires departures when a long-idle candidate rolls below a low gate.

import type { SupabaseClient } from "@supabase/supabase-js";
import { pickAvailable } from "@/lib/ai-pool";
import type { Locale } from "@/lib/language";
import { sysMemberLeft } from "@/lib/system-messages";

const REFILL_MIN_HRS = 12;
const REFILL_MAX_HRS = 24;

export async function tickRotation(
  sb: SupabaseClient,
  worldId: string,
): Promise<{ departed: { id: string; name: string }[]; refilled: number }> {
  // 1. Idle candidates: activated, currently active, last seen >24h ago.
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: idle } = await sb
    .from("members")
    .select("id, name, last_seen_at, activity_weight, ai_character_id")
    .eq("current_location_world_id", worldId)
    .eq("status", "active")
    .not("activated_at", "is", null)
    .lt("last_seen_at", cutoff);

  if (!idle || idle.length === 0) return { departed: [], refilled: 0 };

  // 2. Probability of departure scales with how stale they've gotten.
  //   24-72h idle:   5%
  //   72-168h (1w):  20%
  //   1 week+:       50%
  const departing: typeof idle = [];
  const now = Date.now();
  for (const m of idle) {
    const lastSeen = m.last_seen_at ? new Date(m.last_seen_at).getTime() : 0;
    const idleHrs = (now - lastSeen) / 3_600_000;
    const p = idleHrs > 168 ? 0.50 : idleHrs > 72 ? 0.20 : 0.05;
    if (Math.random() < p) departing.push(m);
  }
  if (departing.length === 0) return { departed: [], refilled: 0 };

  // Plaza language for the parting lines — ko (default) keeps the native
  // PARTING_LINES verbatim; non-ko plazas part in their own language.
  const { data: w } = await sb
    .from("worlds")
    .select("language")
    .eq("id", worldId)
    .maybeSingle();
  const language = ((w?.language ?? "ko") as Locale);

  // 3. Depart each: post a parting line, flip status to ghost so the
  //    unique-active-per-world index permits a fresh row for the same
  //    ai_character later (if they migrate back).
  const departed: { id: string; name: string }[] = [];
  for (const m of departing) {
    const text = sysMemberLeft(language);
    await sb.from("messages").insert({
      world_id: worldId,
      owner_member_id: m.id,
      text,
    });
    const { error } = await sb
      .from("members")
      .update({ status: "ghost" })
      .eq("id", m.id);
    if (!error) departed.push({ id: m.id, name: m.name });
  }

  if (departed.length === 0) return { departed: [], refilled: 0 };

  // 4. Refill from the pool — pick least-loaded characters not already
  //    actively present in this world. Their arrival lands 12–24h later.
  const refilled = await refillFromPool(sb, worldId, departed.length);
  return { departed, refilled };
}

async function refillFromPool(
  sb: SupabaseClient,
  worldId: string,
  count: number,
): Promise<number> {
  const candidates = await pickAvailable(sb, count * 3);
  if (candidates.length === 0) return 0;

  // Skip characters who already have an *active* row in this world (would
  // collide with the (ai_character_id, world_id) WHERE status<>'ghost' uniq).
  const { data: present } = await sb
    .from("members")
    .select("ai_character_id, status")
    .eq("current_location_world_id", worldId)
    .neq("status", "ghost");
  const taken = new Set(
    (present ?? [])
      .map((r) => r.ai_character_id)
      .filter((id): id is string => !!id),
  );
  const fresh = candidates.filter((c) => !taken.has(c.id)).slice(0, count);
  if (fresh.length === 0) return 0;

  const { data: world } = await sb
    .from("worlds")
    .select("created_at")
    .eq("id", worldId)
    .maybeSingle();
  if (!world) return 0;
  const worldAgeS = Math.floor(
    (Date.now() - new Date(world.created_at).getTime()) / 1000,
  );

  const rows = fresh.map((c) => {
    const gapHrs = REFILL_MIN_HRS + Math.random() * (REFILL_MAX_HRS - REFILL_MIN_HRS);
    return {
      ai_character_id: c.id,
      origin_world_id: worldId,
      current_location_world_id: worldId,
      name: c.name,
      persona: {
        sprite: c.sprite,
        affinity: c.base_persona.affinity,
        speech_style: c.base_persona.speech_style,
      },
      backstory: c.base_backstory,
      activity_weight: c.default_activity_weight,
      status: "active",
      activation_priority: 99,        // refills don't compete with seed priority
      activation_offset_seconds: worldAgeS + Math.floor(gapHrs * 3600),
      activated_at: null,
    };
  });

  const { error, data } = await sb.from("members").insert(rows).select("id");
  if (error) {
    console.warn(`[rotation] refill insert failed:`, error.message);
    return 0;
  }
  return data?.length ?? 0;
}
