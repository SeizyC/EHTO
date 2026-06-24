// Ambient AI-to-AI conversation tick.
//
// Called from /api/world/members on each poll (every ~8s on /world).
// The whole point of the room is for the user to OBSERVE members talking to
// each other; the gate scales by silence and stays generous so chatter is the
// default ambient state, not a rarity.
//   · skip if the most recent message is < 15s old (let bubble breathe)
//   · skip if no messages exist yet (let greetings happen first)
//   · short silence  (15–60 s):  18%
//   · medium silence (1–5 min):  35%
//   · long silence   (>5 min):   60%
// Speaker pick: weighted random by activity_weight, excluding the last speaker.
// Context: last 8 messages with speaker labels passed to Claude.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatJoinedAgo,
  generateAmbientLine,
  type ConvoTurn,
  type LineShape,
  type SpeechIntent,
} from "@/lib/member-reply";
import type { Locale } from "@/lib/language";
import { recentlySharedYoutubeIds } from "@/lib/youtube-share";
import { peerHintLine } from "@/lib/prompt-i18n";
import { fetchRecentMemory } from "@/lib/memory-engine";
import { extractTopic, fetchPeerRelations, recordInteraction } from "@/lib/member-relations";
import { getNewsHeadlines } from "@/lib/news-fetch";
import { OBJECT_CATALOG, type PlazaObjectType } from "@/lib/plaza-objects";
import { currentBucket, SCENE_BY_BUCKET, type SceneOfDay } from "@/lib/time-of-day";
import { biasPromptLine, type WorldBias } from "@/lib/world-bias";
import { aggregateImplicit, type ImplicitState } from "@/lib/implicit-pref";
import { kstDayLabel, withDailyReset, remaining, planCap, type Plan } from "@/lib/energy";

type ActiveMember = {
  id: string;
  name: string;
  persona: { affinity?: string[]; speech_style?: string };
  backstory: string | null;
  activity_weight: number;
  /** ISO timestamp the member entered THIS world. Threaded into the
   *  prompt as a Korean duration so "언제 왔어?" gets a real answer
   *  ("오늘", "어제", "3일 전") instead of an invented one. */
  activated_at: string | null;
};

const RECENT_LIMIT = 8;
// Shortest acceptable gap between consecutive ambient lines, so bubbles
// have a beat to breathe. Quick enough that the room feels alive.
const MIN_GAP_MS = 8_000;
// Per-world cooldown (atomic via UPDATE...RETURNING). Even with several
// concurrent callers (cron + multiple poll requests) only one wins the
// claim per window — prevents the "weekendrun says the same line 11 times
// in 90 seconds" race we observed in production.
const AMBIENT_CLAIM_COOLDOWN_MS = 4_000;
// If the owner hasn't pinged any /api/world/* endpoint in this window,
// the world goes quiet — no AI↔AI chatter when nobody's watching. User
// messages still get replies (POST /api/messages refreshes the stamp
// before its kick fires), and the moment the owner opens /world again
// the next 60s safety poll refreshes the stamp and ambient resumes.
const OWNER_OFFLINE_MUTE_MS = 5 * 60_000;

// Minimum gap between two AI→owner check-ins on the same world. With an
// 8h cooldown a 24h day can hold at most 3 check-ins, matching the design
// goal of "두어번 / 하루". When eligible we roll a moderate probability
// inside the ambient branch so the cadence is irregular, not clocklike.
const OWNER_CHECKIN_COOLDOWN_MS = 8 * 3600 * 1000;
// Probability of upgrading an eligible quiet-moment tick into an owner
// check-in. Kept at the long-standing live value (0.20) — raise toward
// ~0.35 if check-ins feel too rare.
const OWNER_CHECKIN_ROLL = 0.2;

export async function tickAmbientConversation(
  sb: SupabaseClient,
  worldId: string,
  opts?: {
    /** When true, ignore the offline-mute gate (used by POST
     *  /api/messages which already proved the owner is right here). */
    forceOnline?: boolean;
    /** When true, skip the "user-just-spoke, wait 1.5s before any AI
     *  replies" grace + the probability roll. Used by POST /api/messages
     *  which needs the reply to fire synchronously before the response
     *  returns — on Cloudflare Workers the prior setTimeout-based 2.5s
     *  delayed fire is killed when the request ends, so we have to
     *  generate the reply in-band. The client-side typingUntil (1.2–2s)
     *  in chat-store still provides the natural beat before the bubble
     *  reveals, so we don't need a server-side delay. */
    replyToUserNow?: boolean;
  },
): Promise<{ spoke: { id: string; name: string; text: string } | null; reason?: string }> {
  // 0a. Owner-online gate. If the owner hasn't touched any endpoint in
  // the last OWNER_OFFLINE_MUTE_MS, the world goes quiet — no AI↔AI
  // chatter into the void. POST /api/messages calls us with
  // forceOnline=true because it just received the owner's input.
  if (!opts?.forceOnline) {
    const { data: w } = await sb
      .from("worlds")
      .select("last_owner_active_at")
      .eq("id", worldId)
      .maybeSingle();
    const lastActive = w?.last_owner_active_at
      ? new Date(w.last_owner_active_at).getTime()
      : 0;
    if (Date.now() - lastActive > OWNER_OFFLINE_MUTE_MS) {
      return { spoke: null, reason: "owner-offline" };
    }
  }

  // 0b. Claim the per-world ambient lock. The UPDATE ... WHERE clause
  // atomically allows only one tick to proceed per cooldown window
  // even when multiple polls fire in parallel. RETURNING tells us if
  // we won the race.
  const cutoffIso = new Date(Date.now() - AMBIENT_CLAIM_COOLDOWN_MS).toISOString();
  const { data: claim } = await sb
    .from("worlds")
    .update({ last_ambient_at: new Date().toISOString() })
    .eq("id", worldId)
    .or(`last_ambient_at.is.null,last_ambient_at.lt.${cutoffIso}`)
    .select("id");
  if (!claim || claim.length === 0) {
    return { spoke: null, reason: "lock-busy" };
  }

  // 1. Active speakers in this world. We fetch every member in the world
  // and filter in JS — chained PostgREST `.not("activated_at","is",null)
  // .neq("status","ghost").gte("activity_weight",0.3)` was occasionally
  // returning an empty set even when the rows existed (root cause not
  // yet isolated; doing the filter client-side is the reliable path).
  const { data: allMembers, error: membersErr } = await sb
    .from("members")
    .select("id, name, persona, backstory, activity_weight, status, activated_at")
    .eq("current_location_world_id", worldId);
  if (membersErr) {
    return { spoke: null, reason: `members-err: ${membersErr.message}` };
  }
  const members = (allMembers ?? []).filter(
    (m) =>
      m.activated_at !== null &&
      m.status !== "ghost" &&
      m.status !== "banned" &&
      m.activity_weight >= 0.3,
  );
  if (members.length === 0) {
    return { spoke: null, reason: `no-active (raw=${allMembers?.length ?? 0})` };
  }

  // 2. Recent transcript (newest first from DB).
  const { data: recentDesc } = await sb
    .from("messages")
    .select("id, text, owner_user_id, owner_member_id, created_at")
    .eq("world_id", worldId)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (!recentDesc || recentDesc.length === 0) return { spoke: null, reason: "no-messages" };

  // Fetch world+owner info for the check-in path (also used for cooldown).
  const { data: world } = await sb
    .from("worlds")
    .select("owner_id, last_owner_checkin_at, bias, plan, moments_used, moments_day, interject_used, interject_day, language, ambient_paused")
    .eq("id", worldId)
    .maybeSingle();
  const language = (world?.language ?? "ko") as Locale;

  // Owner pressed pause: generate nothing (no chatter, no energy spend) until
  // resumed. Checked for every path (poll/cron/message) so it's immediate.
  if (world?.ambient_paused) {
    return { spoke: null, reason: "paused" };
  }
  let ownerHandle: string | null = null;
  if (world?.owner_id) {
    const { data: prof } = await sb
      .from("profiles")
      .select("handle")
      .eq("id", world.owner_id)
      .maybeSingle();
    ownerHandle = prof?.handle ?? null;
  }

  const last = recentDesc[0];
  const silentMs = Date.now() - new Date(last.created_at).getTime();
  const userIsLast = !!last.owner_user_id;

  // Detect "@호명": if the user's last line mentions a present member by
  // name, that member is the obligatory responder. No probability gate, no
  // 3s grace beyond a tiny natural beat — being called and ignored is the
  // worst possible failure mode for the "they have a self" feeling.
  const mentioned = userIsLast
    ? (members as ActiveMember[]).find((m) => last.text.includes(m.name))
    : null;

  let speaker: ActiveMember;
  let intent: SpeechIntent;
  // The handle the AIs will use to address the user. Never the role
  // string "방장" — see prompts.
  const userName = ownerHandle ?? "사용자";

  const dbg = `last=${userIsLast ? "user" : "ai"}/${last.owner_member_id?.slice(0,8) ?? "null"} silent=${Math.floor(silentMs / 1000)}s`;

  if (mentioned) {
    // Mention grace: short beat so @-summon feels responsive (~2s total
    // with the LLM round-trip).
    if (silentMs < 600) return { spoke: null, reason: `mention-grace | ${dbg}` };
    speaker = mentioned;
    // No friction classifier — Claude handles hostile vs benign user
    // input naturally from the system prompt's persona + tone rules.
    intent = { type: "reply-user-mention", userName };
  } else if (userIsLast) {
    // replyToUserNow: skip the natural-pacing gates (POST handler caller
    // needs an in-band reply because background timers die on CF Workers).
    if (!opts?.replyToUserNow) {
      if (silentMs < 1_500) return { spoke: null, reason: "user-grace" };
      const p = silentMs > 6_000 ? 0.98 : 0.85;
      if (Math.random() > p) return { spoke: null, reason: `roll-fail p=${p}` };
    }
    const candidates = (members as ActiveMember[]).filter(
      (m) => m.id !== last.owner_member_id,
    );
    if (candidates.length === 0) return { spoke: null, reason: "no-candidates" };

    // Conversation-thread continuity. Failure mode the user reported:
    //   user@_chaos_: "넌 요즘 책 뭐 좋았어?"  →  _chaos_: "테드창 ..."
    //   user (no @): "어떤 내용이야?"          →  weightedPick → 해리 답함
    // The user was clearly following up on _chaos_'s message but the
    // picker rolled random. Fix: if the prior AI line (recentDesc[1])
    // is from a specific member within ~5 min, bias 80% to that member
    // — they're the *thread partner*. User can break out with @-mention
    // (which takes priority above) or by waiting longer (cutoff).
    const prior = recentDesc[1];
    const priorIsRecent = prior &&
      Date.now() - new Date(prior.created_at).getTime() < 5 * 60_000;
    const threadPartner = (priorIsRecent && prior?.owner_member_id)
      ? candidates.find((m) => m.id === prior.owner_member_id)
      : undefined;
    if (threadPartner && Math.random() < 0.8) {
      speaker = threadPartner;
      console.log(`[ambient] thread-continuity → ${threadPartner.name} (prior speaker)`);
    } else {
      speaker = weightedPick(candidates);
    }
    intent = { type: "reply-user", userName };
  } else {
    // Pure ambient (AI ↔ AI). MIN_GAP_MS prevents thrash; probability
    // scales with silence so the room feels lively but not manic.
    // Target liveliness ≈ 1 line / 30s while the owner watches (the /world
    // poll runs every 30s). At 30s silence the gate must fire most ticks to
    // hit that cadence, so the short-silence branch is 0.85 (not 0.50) —
    // high enough to feel alive on first impression, with enough miss-rate
    // to stay slightly irregular rather than metronomic.
    if (silentMs < MIN_GAP_MS) return { spoke: null, reason: "min-gap" };
    const p =
      silentMs > 5 * 60_000 ? 0.95 :
      silentMs > 1 * 60_000 ? 0.70 :
      0.85;
    if (Math.random() > p) return { spoke: null, reason: `roll-fail p=${p}` };

    const candidates = (members as ActiveMember[]).filter(
      (m) => m.id !== last.owner_member_id,
    );
    if (candidates.length === 0) return { spoke: null, reason: `no-candidates | ${dbg}` };
    // Speaker pick honors implicit mention affinity: members the user
    // has @-summoned recently get a soft boost (max 1.5×) in the
    // weighted random. Helper aggregates from the cache (basically
    // free per tick) — we reuse the result for the prompt below.
    speaker = weightedPickWithMentionBoost(candidates, await aggregateImplicit(sb, worldId));

    // Decide WHAT kind of line this is:
    //   - if a peer just spoke (<60s), bias toward reply-peer
    //   - else mix new-topic / persona-share / mood
    //   - sometimes upgrade to owner check-in (8h cooldown)
    const lastSpokerId = last.owner_member_id;
    const peerJustSpoke = !!lastSpokerId && lastSpokerId !== speaker.id && silentMs < 60_000;
    const peerName = lastSpokerId
      ? (members as ActiveMember[]).find((m) => m.id === lastSpokerId)?.name ?? null
      : null;
    const checkinEligible =
      !!ownerHandle &&
      Date.now() - (world?.last_owner_checkin_at
        ? new Date(world.last_owner_checkin_at).getTime()
        : 0) > OWNER_CHECKIN_COOLDOWN_MS;

    // Look up what's actually placed on this plaza so the Director can
    // occasionally point a speaker at an object ("벤치 비었네 …"). Empty
    // list → object-interaction is impossible and the picker falls back
    // to the existing intent mix.
    const { data: objs } = await sb
      .from("plaza_objects")
      .select("type")
      .eq("world_id", worldId);
    const objectLabels = (objs ?? [])
      .map((o) => OBJECT_CATALOG[o.type as PlazaObjectType]?.label)
      .filter((s): s is string => !!s);

    intent = pickAmbientIntent({
      peerJustSpoke,
      peerName,
      checkinEligible,
      userName: ownerHandle ? userName : null,
      objectLabels,
      scene: SCENE_BY_BUCKET[currentBucket().id],
      // When the user has a clear top implicit topic, the quiet-moment
      // branch boosts `new-topic` so members are more likely to surface
      // something on that thread. Aggregate is cached so this is cheap.
      implicit: await aggregateImplicit(sb, worldId),
    });
  }

  // Track whether this fire is a check-in (we stamp the cooldown after).
  const isOwnerCheckin = intent.type === "check-in";

  // Daily life-energy gate (spec §6). AI↔AI ambient draws from the moment
  // budget (the cost governor); replies to the owner draw from the separate
  // interjection reserve so a *rested* plaza can still answer when spoken to.
  // Both reset at KST midnight. We gate here — before transcript/memory/news
  // assembly and the LLM call — so an exhausted plaza burns nothing.
  const energyKind: "moment" | "interject" =
    intent.type === "reply-user" || intent.type === "reply-user-mention"
      ? "interject"
      : "moment";
  const plan = (world?.plan ?? "free") as Plan;
  const today = kstDayLabel(Date.now());
  const counter = withDailyReset(
    energyKind === "moment"
      ? { used: world?.moments_used ?? 0, day: world?.moments_day ?? null }
      : { used: world?.interject_used ?? 0, day: world?.interject_day ?? null },
    today,
  );
  if (remaining(counter.used, planCap(plan, energyKind)) <= 0) {
    return { spoke: null, reason: `quota-exhausted:${energyKind}` };
  }

  // Build transcript context (oldest → newest) with speaker labels.
  // User messages are labeled with the owner's handle, not the role
  // "방장" — that label leaks meta-info we want to keep invisible
  // (AIs shouldn't say "방장" out loud).
  const ownerLabel = ownerHandle ?? "사용자";
  const nameById = new Map<string, string>();
  for (const m of members as ActiveMember[]) nameById.set(m.id, m.name);
  const transcript: ConvoTurn[] = recentDesc
    .slice()
    .reverse()
    .map((row) => {
      const isMember = !!row.owner_member_id;
      const name = isMember ? (nameById.get(row.owner_member_id!) ?? "?") : ownerLabel;
      return {
        speaker: name,
        text: row.text,
        isSelf: isMember && row.owner_member_id === speaker.id,
      };
    });

  // Anti-repeat: feed the speaker's last 3 lines back in as "don't echo".
  const avoid = recentDesc
    .filter((r) => r.owner_member_id === speaker.id)
    .slice(0, 3)
    .map((r) => r.text);

  // Speaker's past-days diary entries — gives continuity ("어제 ___").
  const memoryTraces = await fetchRecentMemory(sb, speaker.id, 3);
  const memory = memoryTraces.map((t) => `(${t.day}) ${t.text}`);

  // Phase 3: this speaker's recent peer relations. Surfaced in the
  // system prompt as "이 사람들과의 결" so cross-day continuity ("라온
  // 이랑 그때 막걸리 얘기 했었지") becomes possible without the model
  // making it up. Only injected when there's actually something to say.
  const peerRelations = await fetchPeerRelations(sb, speaker.id, 3);
  const peerHints = peerRelations
    .filter((r) => r.interactionCount >= 2 || r.sharedTopics.length > 0)
    .map((r) => peerHintLine(language, r.peerName, r.interactionCount, r.sharedTopics));

  // Generate + insert.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[ambient] ANTHROPIC_API_KEY missing — skipping");
    return { spoke: null, reason: "no-api-key" };
  }
  // Fresh-ish news headlines (cached for 30 min inside the fetcher).
  // World bias (e.g. K-pop + artist) — if set, news-fetch pulls extra
  // artist-targeted queries + interleaves them first, and the speaker
  // prompt gets an identity hint nudging conversation toward the theme.
  const worldBias = (world?.bias ?? null) as WorldBias | null;
  // Implicit preference is cached per-world; multiple aggregateImplicit
  // calls in a single tick all hit the same in-process Map. We pull it
  // once here so news-fetch and the system-prompt nudge share the
  // exact same snapshot.
  const implicit = await aggregateImplicit(sb, worldId);
  const newsHeadlines = await getNewsHeadlines(worldBias, implicit, language);
  const biasHint = biasPromptLine(worldBias, language);
  // implicitHint — top 1-2 keywords, joined. Empty when cold-start or
  // below the panel floor.
  const implicitHint = implicit.topics.length > 0
    ? implicit.topics.slice(0, 2).map((t) => t.topic).join(", ")
    : null;

  const sceneHint = SCENE_BY_BUCKET[currentBucket().id].hint;
  // Shape picker is for ambient AI-to-AI variety only. When the user
  // actually said something (mention or general reply), the AI's job is
  // to *answer the user* — forcing a "quip / observe / wonder" shape
  // when the user asked "책 추천해줘" produces side-eyed non-answers like
  // "방금 책 보다 링크 세 개로 샜어". Skip shape entirely on user-reply
  // turns; let the model respond naturally with whatever shape fits.
  const skipShape = intent.type === "reply-user" || intent.type === "reply-user-mention";
  const shape = skipShape ? undefined : pickShape(intent.type);
  // Only user-directed turns can fire the video-share tool; compute the
  // recently-shared ids just for those so a fulfilled "영상 공유해줘" doesn't
  // surface a thumbnail another member already has up.
  const excludeVideoIds = skipShape
    ? await recentlySharedYoutubeIds(sb, worldId)
    : undefined;
  const text = await generateAmbientLine(speaker, transcript, {
    language,
    intent,
    shape,
    avoid,
    memory,
    joinedAgo: formatJoinedAgo(speaker.activated_at, language),
    newsHeadlines,
    peerHints,
    sceneHint,
    biasHint,
    implicitHint,
    excludeVideoIds,
  });
  if (!text) {
    console.warn(`[ambient] gen returned null for ${speaker.name}`);
    return { spoke: null, reason: `gen-null for ${speaker.name}` };
  }

  const { error } = await sb.from("messages").insert({
    world_id: worldId,
    owner_member_id: speaker.id,
    text,
  });
  if (error) {
    console.warn(`[ambient] insert failed:`, error.message);
    return { spoke: null, reason: `insert-fail: ${error.message}` };
  }

  await sb.from("members").update({ last_seen_at: new Date().toISOString() })
    .eq("id", speaker.id);

  // Consume one unit of the relevant daily budget. The reset was already
  // applied to `counter` above, so day is set to today and used is the
  // pre-increment value. The per-world ambient lock (claimed at the top of
  // this tick) serializes ticks, so a plain read-modify-write is safe here.
  const usedCol = energyKind === "moment" ? "moments_used" : "interject_used";
  const dayCol = energyKind === "moment" ? "moments_day" : "interject_day";
  const { error: consumeErr } = await sb.from("worlds")
    .update({ [usedCol]: counter.used + 1, [dayCol]: today })
    .eq("id", worldId);
  if (consumeErr) {
    // Fail-open: the line already posted; an un-incremented counter just
    // grants one extra moment. Log so a stuck counter is visible in prod.
    console.warn(`[ambient] energy consume failed (${energyKind}):`, consumeErr.message);
  } else if (counter.used + 1 >= planCap(plan, energyKind)) {
    // Beta instrumentation: one-time crossing log when a plaza spends its
    // last unit for the day. The log's own timestamp tells *when* it
    // depleted → how fast the cap is reached. Parsed by scripts/beta-energy.
    console.log(`[beta] cap-reached world=${worldId.slice(0, 8)} kind=${energyKind} plan=${plan} used=${counter.used + 1}`);
  }

  // Phase 3 relations: if a peer member spoke within the last 5 minutes,
  // count this line as an exchange between speaker and that peer + record
  // the topic so cross-day continuity ("라온이랑 그때 막걸리 얘기 했었지")
  // becomes possible. Skip user-driven lines (the user isn't a member).
  if (last.owner_member_id && last.owner_member_id !== speaker.id) {
    const recentMs = Date.now() - new Date(last.created_at).getTime();
    if (recentMs < 5 * 60_000) {
      try {
        // Topic extraction is a separate Claude call. Best-effort: null
        // is fine, just means this exchange counts but doesn't carry a
        // semantic anchor.
        const topic = await extractTopic(text, language);
        await recordInteraction(sb, speaker.id, last.owner_member_id, topic ?? undefined);
      } catch (e) {
        console.warn("[ambient] recordInteraction failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  // Stamp the check-in cooldown so we don't fire another for 8h+.
  if (isOwnerCheckin) {
    await sb.from("worlds")
      .update({ last_owner_checkin_at: new Date().toISOString() })
      .eq("id", worldId);
  }

  // News citation detection (heuristic). For each headline that was
  // injected into the prompt, extract content-bearing tokens (length ≥3,
  // skip very common particles) and check whether the generated line
  // contains any. Cheap, no extra API call. Logs which headline (if any)
  // the speaker latched onto so we can answer "is news actually showing
  // up in ambient lines?" from prod logs without an analytics pipeline.
  const citedHeadline = detectNewsCitation(text, newsHeadlines);
  const citationTag = citedHeadline
    ? ` | news-cited: "${citedHeadline.slice(0, 30)}…"`
    : newsHeadlines.length > 0
      ? ` | news-injected:${newsHeadlines.length}/no-cite`
      : "";

  console.log(`[ambient${isOwnerCheckin ? "/checkin" : ""}] ${speaker.name}: ${text} | ${dbg} | intent=${intent.type} shape=${shape ?? "(none)"}${citationTag}`);
  return { spoke: { id: speaker.id, name: speaker.name, text }, reason: `intent=${intent.type} | ${dbg}` };
}

// Decide what *kind* of line an ambient turn should be. The orchestrator
// has already picked WHO speaks — this picks WHY they speak right now.
// Weights are tuned for variety: a peer-spoke moment leans reply-peer, a
// quiet moment leans persona-share / new-topic, owner check-ins are rare.
function pickAmbientIntent(args: {
  peerJustSpoke: boolean;
  peerName: string | null;
  checkinEligible: boolean;
  userName: string | null;
  objectLabels: string[];
  /** KST scene-of-day. Bends the quiet-moment intent mix (not the
   *  peer-react branch — reactivity is non-negotiable). */
  scene?: SceneOfDay;
  /** Implicit preference state. When a top topic exists and is above
   *  the panel floor, `new-topic` gets a 1.3× weight bump so the room
   *  is more likely to surface something on the user's recent thread. */
  implicit?: ImplicitState;
}): SpeechIntent {
  if (args.peerJustSpoke && args.peerName) {
    // Heavy bias toward reply-peer when a peer just spoke: without this
    // the picker often shifted to new-topic / persona-share, producing
    // the "everyone talks to the air, nobody listens" feel. new-topic
    // is removed from this branch entirely — if you have something to
    // react to, react. Brief persona-aside or mood is the only out.
    const r = Math.random();
    if (r < 0.85) return { type: "reply-peer", peerName: args.peerName };
    if (r < 0.95) return { type: "persona-share" };
    return { type: "mood" };
  }
  // Quieter moment — variety with occasional user check-in.
  if (args.checkinEligible && args.userName && Math.random() < OWNER_CHECKIN_ROLL) {
    return { type: "check-in", userName: args.userName };
  }
  // Scene-aware weighted pick over the quiet-moment intent set. Base
  // weights match the prior r<.35/.65/.85 distribution; the scene's
  // bias map multiplies through so e.g. night skews mood heavier and
  // new-topic lighter.
  const bias = args.scene?.bias ?? {};
  const objectsAllowed = args.objectLabels.length > 0;
  // Implicit nudge: when the user has a clear hot topic, the room is
  // more likely to *raise a topic* on this tick (new-topic ×1.3). The
  // topic content itself comes through the system-prompt biasHint —
  // we don't force a specific topic here, just the channel.
  const hasHotTopic = !!args.implicit && !args.implicit.coldStart && args.implicit.topics.length > 0;
  const newTopicBoost = hasHotTopic ? 1.3 : 1;
  const candidates: Array<{ type: "new-topic" | "persona-share" | "mood" | "object-interaction"; w: number }> = [
    { type: "new-topic",     w: 0.35 * (bias["new-topic"] ?? 1) * newTopicBoost },
    { type: "persona-share", w: 0.40 * (bias["persona-share"] ?? 1) },
    { type: "mood",          w: 0.20 * (bias.mood ?? 1) },
    // Object-interaction floor cut HARD — in production it produced
    // "가로등 색이 라면스프 같네" style word-association failures.
    // Even at 5% it lets one in every 20 quiet lines be a manufactured
    // riff on a piece of furniture. Persona-share absorbs the slack.
    { type: "object-interaction", w: objectsAllowed ? 0.05 * (bias["object-interaction"] ?? 1) : 0 },
  ];
  const total = candidates.reduce((s, c) => s + c.w, 0);
  let pick = Math.random() * total;
  let chosen = candidates[0].type;
  for (const c of candidates) {
    pick -= c.w;
    if (pick <= 0) { chosen = c.type; break; }
  }
  if (chosen === "object-interaction") {
    const objectLabel = args.objectLabels[Math.floor(Math.random() * args.objectLabels.length)];
    return { type: "object-interaction", objectLabel };
  }
  if (chosen === "new-topic") return { type: "new-topic" };
  if (chosen === "persona-share") return { type: "persona-share" };
  return { type: "mood" };
}

// Cheap heuristic: does the speaker's line contain any meaningful token
// from one of the injected headlines? Returns the matched headline or
// null. Tokens shorter than 3 chars and a small stoplist of common
// connectors / generic news words are filtered so we don't false-
// positive on "오늘", "사건", "보도" etc that appear in almost every
// headline AND every other ambient line.
const NEWS_STOP_WORDS = new Set([
  "오늘", "내일", "어제", "이번", "지난", "올해", "내년",
  "사건", "사고", "보도", "발표", "관련", "공개", "예정",
  "이슈", "기사", "뉴스", "최근", "현재", "오전", "오후",
  "한국", "서울", "대한", "정부", "국내", "해외", "전국",
  // very common verbs/adverbs that survive bare-stem extraction
  "있다", "없다", "한다", "된다", "받다",
]);

function detectNewsCitation(text: string, headlines: string[]): string | null {
  if (headlines.length === 0) return null;
  // Extract 3+-char Hangul tokens from the speaker's line.
  const lineTokens = new Set(
    Array.from(text.matchAll(/[가-힣]{3,}/g))
      .map((m) => m[0])
      .filter((t) => !NEWS_STOP_WORDS.has(t)),
  );
  if (lineTokens.size === 0) return null;
  for (const h of headlines) {
    const headlineTokens = Array.from(h.matchAll(/[가-힣]{3,}/g))
      .map((m) => m[0])
      .filter((t) => !NEWS_STOP_WORDS.has(t));
    for (const ht of headlineTokens) {
      if (lineTokens.has(ht)) return h;
    }
  }
  return null;
}

// Shape mix per intent. The orchestrator picks the WHAT (intent), then
// rolls the HOW (shape) so the room doesn't degenerate into a wall of
// same-length 단정문. Weights tuned by intent: react/reply skews short
// (quip/question), persona-share skews longer (share/take), mood/object
// skews observational. Always passing this through means the gpt prompt
// gets a concrete form-anchor each turn instead of just "say something".
function pickShape(intent: SpeechIntent["type"]): LineShape {
  // Rebalanced 2026-05-23: prod logs over 50+ lines showed the room
  // drifting to "사무실 멍때리는 사람" — sensory observation only ("에어컨
  // 바람", "햇빛", "손등 시려"). observe weight was too high across the
  // mix. Cut observe ~50%, push share/take/question (substance carriers).
  const weights: Record<LineShape, number> = (() => {
    switch (intent) {
      case "reply-user-mention":
      case "reply-user":
        return { quip: 25, share: 25, question: 20, observe: 5, take: 20, wonder: 5 };
      case "reply-peer":
        return { quip: 30, share: 20, question: 20, observe: 5, take: 20, wonder: 5 };
      case "new-topic":
        return { quip: 5, share: 35, question: 15, observe: 10, take: 30, wonder: 5 };
      case "persona-share":
        return { quip: 5, share: 45, question: 5, observe: 10, take: 30, wonder: 5 };
      case "mood":
        return { quip: 25, share: 25, question: 10, observe: 20, take: 15, wonder: 5 };
      case "object-interaction":
        return { quip: 10, share: 25, question: 5, observe: 30, take: 25, wonder: 5 };
      case "check-in":
        return { quip: 25, share: 10, question: 55, observe: 0, take: 5, wonder: 5 };
    }
  })();
  const entries = Object.entries(weights) as Array<[LineShape, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let pick = Math.random() * total;
  for (const [shape, w] of entries) {
    pick -= w;
    if (pick <= 0) return shape;
  }
  return entries[0][0];
}

function weightedPick<T extends { activity_weight: number }>(arr: T[]): T {
  const total = arr.reduce((s, x) => s + Math.max(0.05, x.activity_weight), 0);
  let pick = Math.random() * total;
  for (const x of arr) {
    pick -= Math.max(0.05, x.activity_weight);
    if (pick <= 0) return x;
  }
  return arr[arr.length - 1];
}

/** Weighted pick with a soft (max 1.5×) boost for members the user has
 *  @-mentioned recently. Boost is normalised against the max mention
 *  score across the pool so a single heavily-mentioned member doesn't
 *  monopolise the room. */
function weightedPickWithMentionBoost<T extends { id: string; activity_weight: number }>(
  arr: T[],
  implicit: ImplicitState,
): T {
  if (implicit.coldStart || implicit.mentions.size === 0) return weightedPick(arr);
  const maxMention = Math.max(...Array.from(implicit.mentions.values()));
  if (maxMention <= 0) return weightedPick(arr);
  const weighted = arr.map((m) => {
    const raw = implicit.mentions.get(m.id) ?? 0;
    const norm = raw / maxMention; // 0..1
    const boost = 1 + 0.5 * norm;  // 1.0..1.5
    return { m, w: Math.max(0.05, m.activity_weight) * boost };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let pick = Math.random() * total;
  for (const x of weighted) {
    pick -= x.w;
    if (pick <= 0) return x.m;
  }
  return weighted[weighted.length - 1].m;
}
