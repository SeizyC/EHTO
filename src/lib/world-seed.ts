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
import type { Locale } from "@/lib/language";
import { sysMemberJoined } from "@/lib/system-messages";
import { localizeIdentity } from "@/lib/member-identity";
import { pickClearSpot, buildObstacles } from "@/lib/position-drift";

// How many AI characters a brand-new world initially recruits from the pool.
// They land as dormant rows; lazy activation reveals them on schedule, capped
// by the plaza's plan (free 6 / Plus 12). Seed = the hard cap (12) so the
// dormant overflow forms a "bench" that fills empty slots as members rotate
// out — but activation never exceeds the plan cap.
const SEED_COUNT = 12;

// Max members to admit in a single activation tick. Even when several
// dormant members are *eligible* at once — e.g. the owner returns after a
// long absence and a backlog of scheduled arrivals has piled up — we let
// them in one at a time (one per ~30s poll) so arrivals feel like people
// walking in, not a crowd materializing at once with a burst of greetings.
const MAX_ACTIVATIONS_PER_TICK = 1;

// Minimum real-time gap between two arrivals in the same world. This is the
// anti-"우르르" spacing: even if a big scheduled backlog is all "overdue" —
// e.g. an owner created the world long ago but rarely logged in, so every
// created_at-anchored offset has elapsed — we still admit at most ONE new
// friend per this gap. Because activation only ticks while the owner is on
// /world, arrivals become engagement-paced (a friend trickles in during a
// visit, ~one per gap) instead of the whole roster materializing at once.
// 6h matches the design's minimum inter-arrival spacing.
const MIN_ARRIVAL_GAP_MS = 6 * 3600 * 1000;

export async function ensureWorld(
  sb: SupabaseClient,
  ownerId: string,
  name?: string,
  language?: Locale,
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

  // Only first-time creation honors `language`; omit it entirely when not
  // chosen so the DB column default ('ko') stands — preserving the ko path.
  const { data: created, error } = await sb
    .from("worlds")
    .insert({ owner_id: ownerId, name: name ?? null, ...(language ? { language } : {}) })
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

  // Plaza language. ko (default) keeps the native Korean pool identities
  // verbatim; non-ko plazas render each member's identity in-language.
  const { data: w } = await sb
    .from("worlds")
    .select("language")
    .eq("id", worldId)
    .maybeSingle();
  const language = ((w?.language ?? "ko") as Locale);

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

  // For non-ko plazas, generate a native identity per character from its
  // neutral archetype. ko → all-null (every field below falls back to the
  // Korean pool defaults, so ko stays byte-identical to before). Per-item
  // failure tolerated: a null entry just means that member keeps its
  // Korean pool defaults instead of dropping out of the seed.
  const localized = language === "ko"
    ? ordered.map(() => null)
    : await Promise.all(
        ordered.map((c) =>
          localizeIdentity(
            {
              affinity: c.base_persona.affinity ?? [],
              speechSeed: c.base_persona.speech_style ?? "",
              backstorySeed: c.base_backstory ?? "",
            },
            language,
          ).catch(() => null),
        ),
      );

  // members.name has no DB UNIQUE constraint, but two identically-named
  // residents in one plaza read as a bug to users — so we de-duplicate
  // localized (en/ja) display names for quality. Generated names may collide
  // within this batch or with names already present in this world. De-duplicate
  // only the localized names (ko names are pool-unique and untouched, preserving
  // the ko path exactly). Existing-name set is fetched once; a colliding name
  // gets a bounded numeric suffix.
  const seedNames = new Set<string>();
  if (language !== "ko") {
    const { data: existing } = await sb
      .from("members")
      .select("name")
      .eq("current_location_world_id", worldId);
    for (const r of existing ?? []) if (r.name) seedNames.add(r.name);
  }
  const uniqueName = (proposed: string): string => {
    if (!seedNames.has(proposed)) {
      seedNames.add(proposed);
      return proposed;
    }
    for (let i = 2; i <= 9; i++) {
      const candidate = `${proposed} ${i}`;
      if (!seedNames.has(candidate)) {
        seedNames.add(candidate);
        return candidate;
      }
    }
    // Exhausted suffixes — fall back to a guaranteed-unique tail.
    const candidate = `${proposed} ${Date.now() % 1000}`;
    seedNames.add(candidate);
    return candidate;
  };

  const rows = ordered.map((c, idx) => {
    const priority = idx + 1;
    const id = localized[idx];
    // Name: non-ko plazas use the character's canonical per-locale name
    // (name_i18n — fixed across plazas, so the same sprite reads as the same
    // person), falling back to the invented localized name, then the ko pool
    // name. ko always uses c.name. speech_style/backstory stay localized.
    const canonical = language !== "ko" ? c.name_i18n?.[language] : undefined;
    const name = canonical
      ? uniqueName(canonical)
      : id?.name
        ? uniqueName(id.name)
        : c.name;
    return {
      ai_character_id: c.id,
      origin_world_id: worldId,
      current_location_world_id: worldId,
      name,
      persona: {
        sprite: c.sprite,
        affinity: c.base_persona.affinity,        // neutral slugs kept as-is
        speech_style: id?.speech_style ?? c.base_persona.speech_style,
      },
      backstory: id?.backstory ?? c.base_backstory,
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
// Retention-first pacing: the FIRST friend should show up almost right away
// (~1 min) so a brand-new owner witnesses an arrival — the warm-up moment that
// proves "the world is alive" and kicks off ambient chatter. Every arrival
// after that is spaced 6–12 hours apart so the full roster drips in over
// ~6–10 days, giving a steady reason to come back daily.
//
//   p1     : ~1 min after world creation (onboarding lands on /world right
//            after creation, so this reads as "a minute after you arrive")
//   p2..pN : cumulative, each 6–12 h further than the previous one
//
// Generated all at once so monotonicity is guaranteed across priorities
// (no risk of p3 landing earlier than p2 due to independent randomness).
export function generateActivationOffsets(n: number): number[] {
  if (n <= 0) return [];
  const offsets: number[] = [];
  // p1: ~1 min (45-90s) — the first friend arrives while the owner is looking.
  let cum = 45 + Math.floor(Math.random() * 45);
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
    .select("plan, language")
    .eq("id", worldId)
    .maybeSingle();
  const cap = memberCap((w?.plan ?? "free") as Plan);
  const language = ((w?.language ?? "ko") as Locale);
  // Pull the active roster (not just a count) so we can both enforce the
  // cap AND avoid admitting a member whose sprite a present resident
  // already wears — two identical-looking characters in one room reads as
  // a bug. (Only 5 hero sprites exist today, so this can only de-dup up to
  // the first 5 residents; beyond that a repeat is unavoidable until more
  // sprites ship.)
  const { data: active } = await sb
    .from("members")
    .select("persona, activated_at, x, y")
    .eq("current_location_world_id", worldId)
    .not("activated_at", "is", null)
    .not("status", "in", "(ghost,banned)");
  const activeCount = active?.length ?? 0;

  // Anti-"우르르" spacing: once at least one friend is here, admit no more
  // than one per MIN_ARRIVAL_GAP_MS of real time — even if a big scheduled
  // backlog is all overdue. Activation only ticks while the owner is on
  // /world, so arrivals become engagement-paced instead of dumping the whole
  // roster the moment a long-absent owner logs back in.
  if (activeCount > 0) {
    const latestActivatedMs = Math.max(
      0,
      ...(active ?? []).map((m) =>
        m.activated_at ? new Date(m.activated_at as string).getTime() : 0,
      ),
    );
    if (Date.now() - latestActivatedMs < MIN_ARRIVAL_GAP_MS) {
      return { activated: [] };
    }
  }
  const usedSprites = new Set(
    (active ?? [])
      .map((m) => (m.persona as { sprite?: string } | null)?.sprite)
      .filter(Boolean) as string[],
  );
  const free = Math.max(0, cap - activeCount);
  if (free === 0) return { activated: [] };

  const nowIso = new Date().toISOString();
  // Earliest-scheduled first, but bubble up candidates whose sprite isn't
  // already on the floor so a one-at-a-time admission still lands a
  // visually distinct newcomer when one is available.
  const ordered = [...eligible].sort(
    (a, b) =>
      (a.activation_offset_seconds ?? 0) - (b.activation_offset_seconds ?? 0),
  );
  const spriteOf = (m: (typeof ordered)[number]) =>
    (m.persona as { sprite?: string } | null)?.sprite;
  const distinct = ordered.filter((m) => {
    const s = spriteOf(m);
    return !s || !usedSprites.has(s);
  });
  const pickFrom = distinct.length > 0 ? distinct : ordered;
  const ids = pickFrom
    .slice(0, Math.min(free, MAX_ACTIVATIONS_PER_TICK))
    .map((m) => m.id);

  // Placement inputs: keep newcomers off the fountain/objects and off each
  // other + the owner avatar. Built once and reused (taken grows as we place).
  const obstacles = await buildObstacles(sb, worldId);
  const { data: wpos } = await sb
    .from("worlds")
    .select("owner_x, owner_y")
    .eq("id", worldId)
    .maybeSingle();
  const taken: Array<{ x: number; y: number }> = [
    { x: (wpos?.owner_x as number | null) ?? 50, y: (wpos?.owner_y as number | null) ?? 60 },
    ...(active ?? [])
      .filter((m) => typeof m.x === "number" && typeof m.y === "number")
      .map((m) => ({ x: m.x as number, y: m.y as number })),
  ];

  // Race-safe activation, one row at a time. Each newcomer is placed at a
  // scattered, obstacle-clear floor spot IN the same update, so the realtime
  // "activated" event already carries a real position — instead of the
  // (50,60) center default that made every arrival's wormhole open on the
  // fountain until a later drift tick nudged them apart.
  type Activated = { id: string; name: string; persona: unknown; backstory: string | null; activity_weight: number };
  const justActivated: Activated[] = [];
  for (const id of ids) {
    const spot = pickClearSpot(taken, obstacles);
    const flip = spot.x > 50; // face inward (left of center → face right)
    const { data: rows, error } = await sb
      .from("members")
      .update({ activated_at: nowIso, last_seen_at: nowIso, x: spot.x, y: spot.y, flip, pos_updated_at: nowIso })
      .eq("id", id)
      .is("activated_at", null)
      .select("id, name, persona, backstory, activity_weight");
    if (error) throw new Error(`activate: ${error.message}`);
    if (rows && rows[0]) {
      justActivated.push(rows[0] as Activated);
      taken.push(spot);
    }
  }
  if (justActivated.length === 0) return { activated: [] };

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
      text: sysMemberJoined(language, m.name),
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
          { peers: peers.filter((p) => p !== m.name), transcript, language },
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
