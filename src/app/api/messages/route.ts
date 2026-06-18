import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { dayStart, dayEnd, dayStartFromLabel } from "@/lib/day-rollover";
import { tickAmbientConversation } from "@/lib/ambient-loop";
import { classifySteer, stripAffinityTopic } from "@/lib/topic-steer";
import { invalidateImplicit } from "@/lib/implicit-pref";
import type { Locale } from "@/lib/language";

// Weight for an explicit "let's talk about Y" focus signal — large enough
// to climb above an accumulated topic fast (vs the +1.0 of a normal line).
const FOCUS_WEIGHT = 8.0;

// GET  /api/messages?limit=50  — latest N messages in authed user's world
// POST /api/messages { text }  — append user message (returns inserted row).
// AI replies are no longer generated inside this POST: that produced a
// synchronous OpenAI roundtrip on every send (slow input) AND made replies
// land in the same instant the user's message did (awkwardly fast).
// The ambient loop (lib/ambient-loop.ts) picks up the unanswered user msg
// on the next poll and inserts a reply after a small natural delay.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Without this, Next dev caches supabase GETs and the client gets the
// stale message list for many seconds after a new line is inserted.
export const fetchCache = "force-no-store";

async function getUserAndWorld(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: NextResponse.json({ error: "missing auth" }, { status: 401 }) };

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return { error: NextResponse.json({ error: "invalid session" }, { status: 401 }) };
  }
  const { data: world } = await sb
    .from("worlds")
    .select("id, language")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!world) return { error: NextResponse.json({ error: "no world" }, { status: 404 }) };

  const language = (world.language ?? "ko") as Locale;
  return { sb, userId: userData.user.id, worldId: world.id, language };
}

export async function GET(req: NextRequest) {
  const ctx = await getUserAndWorld(req);
  if ("error" in ctx) return ctx.error;

  const { sb, worldId } = ctx;
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get("limit") ?? 200));

  // Day window — defaults to "today" (KST 09:00 rollover). Pass
  // `?date=YYYY-MM-DD` to fetch a past day's full transcript.
  const dateParam = req.nextUrl.searchParams.get("date");
  const start = dateParam ? dayStartFromLabel(dateParam) : dayStart();
  const end = dayEnd(start);

  // Join the speaker's name so the feed can render the label without
  // depending on the client-side members-store being loaded.
  // ascending=false + limit picks newest within the window; reverse for
  // chronological client display.
  const { data, error } = await sb
    .from("messages")
    .select("id, owner_user_id, owner_member_id, text, kind, created_at, members(name)")
    .eq("world_id", worldId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Row = {
    id: string;
    owner_user_id: string | null;
    owner_member_id: string | null;
    text: string;
    kind: string | null;
    created_at: string;
    members?: { name: string }[] | { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const flat = rows
    .slice()
    .reverse()
    .map((r) => {
      const speaker = Array.isArray(r.members)
        ? r.members[0]?.name ?? null
        : r.members?.name ?? null;
      return {
        id: r.id,
        owner_user_id: r.owner_user_id,
        owner_member_id: r.owner_member_id,
        text: r.text,
        kind: r.kind ?? "chat",
        created_at: r.created_at,
        speaker_name: speaker,
      };
    });
  return NextResponse.json({ messages: flat });
}

export async function POST(req: NextRequest) {
  const ctx = await getUserAndWorld(req);
  if ("error" in ctx) return ctx.error;

  const { sb, userId, worldId, language } = ctx;
  let body: { text?: string; id?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "too long (max 500)" }, { status: 400 });

  // Client-supplied UUID. Lets the optimistic UI use the SAME id the
  // server will use, so realtime/poll dedup-by-id catches the round-
  // trip naturally (previously: tempId on client + real id on server
  // produced 2-3 duplicate copies until the manual swap finished).
  // We accept only valid v4-shape UUIDs to avoid letting clients pick
  // collision-prone or sequential ids.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const clientId = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : undefined;

  const insertPayload: Record<string, unknown> = {
    world_id: worldId,
    owner_user_id: userId,
    text,
  };
  if (clientId) insertPayload.id = clientId;

  const { data: userMsg, error } = await sb
    .from("messages")
    .insert(insertPayload)
    .select("id, owner_user_id, owner_member_id, text, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ─── Implicit preference capture ───
  // Fire-and-forget: extract a topic keyword + scan for @-mentions and
  // append rows to user_signals. Failure here must NEVER block the
  // message round-trip (Haiku could be down, mentions parse could
  // explode on weird text), so the whole block is voided and wrapped.
  // The aggregate cache for this world is invalidated so the next
  // ambient-loop tick (or news fetch / etc.) sees the new signal.
  void (async () => {
    try {
      const svc2 = serviceClient();
      const rows: Array<Record<string, unknown>> = [];
      let steered = false;

      // (1) topic + steering. classifySteer separates a plain topic from
      //     an explicit "stop X / let's talk Y", so a steering line never
      //     ironically reinforces the very topic the user is dropping.
      const steer = await classifySteer(text, language).catch(() => null);

      // drop → hard-mute + strip from member affinity; never reinforce it.
      if (steer?.drop) {
        await svc2.from("user_topic_mutes").upsert(
          { user_id: userId, world_id: worldId, topic_keyword: steer.drop },
          { onConflict: "user_id,world_id,topic_keyword" },
        );
        await stripAffinityTopic(svc2, worldId, steer.drop);
        steered = true;
      }

      // focus → strong positive signal so it climbs to the top fast, and
      //         unmute it if it had been muted before.
      if (steer?.focus) {
        await svc2
          .from("user_topic_mutes")
          .delete()
          .eq("user_id", userId)
          .eq("world_id", worldId)
          .eq("topic_keyword", steer.focus);
        rows.push({
          user_id: userId,
          world_id: worldId,
          kind: "chat",
          topic_keyword: steer.focus,
          weight: FOCUS_WEIGHT,
        });
        steered = true;
      }

      // plain topic → normal +1.0, but never reinforce a just-dropped one.
      if (steer?.topic && steer.topic !== steer.drop) {
        rows.push({
          user_id: userId,
          world_id: worldId,
          kind: "chat",
          topic_keyword: steer.topic,
          weight: 1.0,
        });
      }

      // (2) mention signal — match each @<name> token to an active
      //     member in this world. Multiple mentions in one message
      //     produce one row per mentioned member.
      const mentionedNames = Array.from(
        text.matchAll(/@([\p{L}\p{N}_.\-]+)/gu),
      ).map((m) => m[1]);
      if (mentionedNames.length > 0) {
        const { data: members } = await svc2
          .from("members")
          .select("id, name")
          .eq("current_location_world_id", worldId)
          .in("name", mentionedNames);
        for (const m of members ?? []) {
          rows.push({
            user_id: userId,
            world_id: worldId,
            kind: "mention",
            target_member_id: (m as { id: string }).id,
            weight: 0.8,
          });
        }
      }

      if (rows.length > 0) {
        await svc2.from("user_signals").insert(rows);
      }
      // Invalidate the aggregate cache if anything changed — including a
      // pure drop (mute + affinity strip) that inserts no signal rows.
      if (rows.length > 0 || steered) {
        invalidateImplicit(worldId);
      }
    } catch (e) {
      console.warn("[implicit] capture failed:",
        e instanceof Error ? e.message : e);
    }
  })();

  // Trigger an in-band ambient reply BEFORE returning the response.
  //
  // Prior design used `setTimeout(fire, 2500)` to fire the AI reply 2.5s
  // after the user's message landed — this worked on Vercel/Node serverless
  // where the function process lingers, but on Cloudflare Workers any
  // work scheduled after the response returns gets killed. The user's
  // message would land but no AI ever replied.
  //
  // Trade-off: response now waits ~3–5s for Claude to generate the
  // reply. The client-side typing-bubble (chat-store typingUntil, 1.2–
  // 2s) still provides the natural beat between user's message and the
  // AI line revealing, so UX-wise the visible cadence is unchanged —
  // we're just shifting where the wait happens (in the POST round-trip
  // instead of in a background timer).
  //
  // forceOnline: heartbeat may be stale; we just proved owner is here.
  // replyToUserNow: skip the 1.5s grace + probability gate; the caller
  // needs a deterministic reply (no roll-fail) in this single pass.
  const svc = serviceClient();
  void svc.from("worlds")
    .update({ last_owner_active_at: new Date().toISOString() })
    .eq("id", worldId);

  // Natural-pacing pause before the AI line lands. Without this the
  // reply can land 0.3–1s after the user's message (model sometimes fast),
  // which reads as "robotic instant answer". 2s artificial delay +
  // ~1–3s Claude generation → AI bubble appears ~3–5s after user message,
  // matching the cadence a real chat partner would have.
  //
  // CF Workers note: await-sleep is wall-clock (not CPU time) and is
  // safe inside the request lifecycle — unlike setTimeout-after-response
  // which gets killed.
  const REPLY_DELAY_MS = 2_000;
  await new Promise((r) => setTimeout(r, REPLY_DELAY_MS));

  try {
    await tickAmbientConversation(svc, worldId, {
      forceOnline: true,
      replyToUserNow: true,
    });
  } catch (e) {
    console.warn("[messages] ambient kick failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ message: userMsg, replies: [] });
}
