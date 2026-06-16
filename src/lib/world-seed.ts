// World + members seeding — idempotent.
//   · ensureWorld:   1 world row per owner (creates if missing). Accepts optional name.
//   · seedMembersIfEmpty: pre-seeds 12 members as DORMANT (activated_at = null).
//     None of them appear until tickMemberActivations activates them on schedule.
//   · tickMemberActivations: lazy activation — checks time since world creation
//     and activates dormant members whose scheduled offset has elapsed, up to
//     the plaza's plan capacity (free 6 / Plus 12).

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAiPool, pickAvailable } from "@/lib/ai-pool";
import { memberCap, type Plan } from "@/lib/energy";

// How many AI characters a brand-new world initially recruits from the pool.
// They land as dormant rows; lazy activation reveals them on schedule, capped
// by the plaza's plan (free 6 / Plus 12). Seed = the hard cap (12) so the
// dormant overflow forms a "bench" that fills empty slots as members rotate
// out — but activation never exceeds the plan cap.
const SEED_COUNT = 12;

export async function ensureWorld(
  sb: SupabaseClient,
  ownerId: string,
  name?: string,
): Promise<string> {
  const { data: existing } = await sb
    .from("worlds")
    .select("id, name")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (existing?.id) {
    // If a name was provided and not set yet, set it
    if (name && !existing.name) {
      await sb.from("worlds").update({ name }).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await sb
    .from("worlds")
    .insert({ owner_id: ownerId, name: name ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`world insert: ${error.message}`);
  return created.id;
}

export async function seedMembersIfEmpty(
  sb: SupabaseClient,
  worldId: string,
): Promise<{ inserted: number; skipped: boolean }> {
  const { count } = await sb
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("current_location_world_id", worldId);

  if ((count ?? 0) > 0) return { inserted: 0, skipped: true };

  // Make sure the global pool is populated, then draw the least-loaded slice.
  await ensureAiPool(sb);
  const picked = await pickAvailable(sb, SEED_COUNT);
  if (picked.length === 0) return { inserted: 0, skipped: true };

  // Highest default weight activates first.
  const ordered = [...picked].sort(
    (a, b) => b.default_activity_weight - a.default_activity_weight,
  );

  // Pre-generate monotonic offsets for the whole roster up front so the
  // arrival ramp is well-shaped regardless of randomness.
  const offsets = generateActivationOffsets(ordered.length);

  const rows = ordered.map((c, idx) => {
    const priority = idx + 1;
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
      activation_priority: priority,
      activation_offset_seconds: offsets[idx],
      activated_at: null,
    };
  });

  const { error, data } = await sb.from("members").insert(rows).select("id");
  if (error) throw new Error(`members seed: ${error.message}`);
  return { inserted: data?.length ?? 0, skipped: false };
}

// Per-world activation schedule generator.
//
// Retention-first pacing: a brand-new room should feel alive within the
// first hour (one arrival validates "the world is real"), but every
// arrival after that is spaced 6–12 hours apart. With 15 members in a
// roster, this stretches the full population over ~6–10 days, giving the
// owner a steady drip-feed reason to come back daily.
//
//   p1     : 10–60 min after world creation
//   p2..pN : cumulative, each 6–12 h further than the previous one
//
// Generated all at once so monotonicity is guaranteed across priorities
// (no risk of p3 landing earlier than p2 due to independent randomness).
export function generateActivationOffsets(n: number): number[] {
  if (n <= 0) return [];
  const offsets: number[] = [];
  // p1: 10-60 min — soon enough to confirm the room isn't empty
  let cum = 600 + Math.floor(Math.random() * (3600 - 600));
  offsets.push(cum);
  for (let i = 2; i <= n; i++) {
    const gapHrs = 6 + Math.random() * 6;   // 6–12 h between arrivals
    cum += Math.floor(gapHrs * 3600);
    offsets.push(cum);
  }
  return offsets;
}

// Lazy activation tick: activates dormant members whose stored offset has
// elapsed AND inserts an arrival greeting message for each so the user sees
// "X just entered + said hi". Idempotent — race-safe via .is(null) clause
// on the UPDATE so concurrent ticks don't double-greet.
export async function tickMemberActivations(
  sb: SupabaseClient,
  worldId: string,
  worldCreatedAt: string,
): Promise<{ activated: { id: string; name: string }[] }> {
  const elapsedSec = Math.floor((Date.now() - new Date(worldCreatedAt).getTime()) / 1000);

  const { data: eligible } = await sb
    .from("members")
    .select("id, name, persona, backstory, activity_weight, activation_offset_seconds")
    .eq("current_location_world_id", worldId)
    .is("activated_at", null)
    .lte("activation_offset_seconds", elapsedSec);

  if (!eligible || eligible.length === 0) return { activated: [] };

  // Capacity cap: never activate beyond the plaza's plan limit (free 6 /
  // Plus 12). Count current residents (activated, not ghost/banned), then
  // admit only the earliest-scheduled dormant members into the free slots.
  // Surplus eligibles stay dormant and fill in later as members rotate out.
  const { data: w } = await sb
    .from("worlds")
    .select("plan")
    .eq("id", worldId)
    .maybeSingle();
  const cap = memberCap((w?.plan ?? "free") as Plan);
  const { count: activeCount } = await sb
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("current_location_world_id", worldId)
    .not("activated_at", "is", null)
    .not("status", "in", "(ghost,banned)");
  const free = Math.max(0, cap - (activeCount ?? 0));
  if (free === 0) return { activated: [] };

  const nowIso = new Date().toISOString();
  const ids = [...eligible]
    .sort(
      (a, b) =>
        (a.activation_offset_seconds ?? 0) - (b.activation_offset_seconds ?? 0),
    )
    .slice(0, free)
    .map((m) => m.id);

  // Race-safe activation: only flip rows that are still dormant.
  const { data: justActivated, error } = await sb
    .from("members")
    .update({ activated_at: nowIso, last_seen_at: nowIso })
    .in("id", ids)
    .is("activated_at", null)
    .select("id, name, persona, backstory, activity_weight");

  if (error) throw new Error(`activate: ${error.message}`);
  if (!justActivated || justActivated.length === 0) return { activated: [] };

  // Log each fresh activation as a visit so the room's visit counts
  // include AI arrivals (today / week / cumulative).
  await sb.from("visits").insert(
    justActivated.map((m) => ({ world_id: worldId, member_id: m.id })),
  );

  // 1) System "X 님이 입장하셨어요" line per arrival — purely informational,
  // owner-less, rendered differently in the feed.
  await sb.from("messages").insert(
    justActivated.map((m) => ({
      world_id: worldId,
      kind: "system",
      text: `${m.name} 님이 입장하셨어요`,
    })),
  );

  // 2) AI's own first words. Now room-aware: we fetch the existing
  // residents and recent transcript so the greeting can reference the
  // actual room state ("다들 음악 얘기 중이네 ㅎ") rather than blurting
  // a generic line.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { generateGreeting } = await import("./member-reply");

      // Roster (other present members) + last few messages.
      const [{ data: roster }, { data: recent }] = await Promise.all([
        sb.from("members")
          .select("name")
          .eq("current_location_world_id", worldId)
          .neq("status", "ghost")
          .not("activated_at", "is", null),
        sb.from("messages")
          .select("text, owner_user_id, owner_member_id, members(name), kind")
          .eq("world_id", worldId)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      const peers = (roster ?? []).map((r) => r.name).filter(Boolean);
      type RecentRow = {
        text: string;
        owner_user_id: string | null;
        owner_member_id: string | null;
        kind?: string;
        members?: { name: string }[] | { name: string } | null;
      };
      const transcript = ((recent ?? []) as unknown as RecentRow[])
        .slice()
        .reverse()
        .filter((r) => r.kind !== "system") // skip prior system lines
        .map((r) => {
          if (r.owner_user_id) return `방장: ${r.text}`;
          const m = Array.isArray(r.members) ? r.members[0] : r.members;
          return `${m?.name ?? "?"}: ${r.text}`;
        });

      for (const m of justActivated) {
        const greeting = await generateGreeting(
          m as Parameters<typeof generateGreeting>[0],
          { peers: peers.filter((p) => p !== m.name), transcript },
        );
        if (!greeting) continue;
        await sb.from("messages").insert({
          world_id: worldId,
          owner_member_id: m.id,
          text: greeting,
        });
      }
    } catch (e) {
      console.warn("greeting generation failed:", e instanceof Error ? e.message : e);
    }
  }

  return { activated: justActivated.map((m) => ({ id: m.id, name: m.name })) };
}
