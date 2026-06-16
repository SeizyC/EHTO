import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { seedMembersIfEmpty, tickMemberActivations } from "@/lib/world-seed";
import { tickAmbientConversation } from "@/lib/ambient-loop";
import { tickRotation } from "@/lib/rotation";
import { maybeInsertAbsenceRecap } from "@/lib/absence-recap";
import { tickMusicShare } from "@/lib/music-share";
import { tickYoutubeShare } from "@/lib/youtube-share";
import { tickPlazaGrowth } from "@/lib/plaza-grow";
import { tickMemberPositions } from "@/lib/position-drift";
import { tickPersonaDrift } from "@/lib/persona-drift";
import { kstDayLabel, energyView, type Plan } from "@/lib/energy";

// GET /api/world/members
// · Lazy-activates any dormant members whose scheduled offset has elapsed
// · Returns only activated members (the visible roster)
// Header: Authorization: Bearer <user JWT>

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bypass Next's fetch cache so Supabase reads inside the tick always
// see the latest DB state (otherwise the just-inserted ambient line
// isn't visible on the immediate next tick).
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const { data: world, error: worldErr } = await sb
    .from("worlds")
    .select("id, name, created_at, last_owner_active_at")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (worldErr) return NextResponse.json({ error: worldErr.message }, { status: 500 });
  if (!world) return NextResponse.json({ worldId: null, name: null, members: [] });

  // Lazy bootstrap + activation tick (uses service role so it bypasses RLS).
  // seedMembersIfEmpty is a no-op if the world already has members — safe to
  // call on every read. Recovers worlds whose initial seed never ran.
  const svc = serviceClient();
  // Capture the PRIOR heartbeat before we overwrite it — the absence
  // recap needs to know how long the owner was away. After this read
  // we refresh the stamp so the ambient gate stays open while they're
  // on /world.
  const prevActiveAt = world.last_owner_active_at ?? null;
  await svc.from("worlds")
    .update({ last_owner_active_at: new Date().toISOString() })
    .eq("id", world.id);
  // Absence recap (D): if the gap since the prior heartbeat is long
  // enough AND meaningful AI chatter happened in that window, insert
  // a one-line summary as a kind="recap" message. Fire-and-forget so
  // it doesn't gate the response.
  void (async () => {
    try { await maybeInsertAbsenceRecap(svc, world.id, prevActiveAt); }
    catch (e) { console.warn("[recap] failed:", e instanceof Error ? e.message : e); }
  })();
  try {
    await seedMembersIfEmpty(svc, world.id);
    await tickMemberActivations(svc, world.id, world.created_at);
    // Rotation runs before ambient: a departure leaves a parting line that
    // ambient can react to in the same tick.
    await tickRotation(svc, world.id);
    // Ambient AI↔AI: probability-gated, so this is a cheap no-op most ticks.
    // forceOnline since we just confirmed the owner is right here.
    await tickAmbientConversation(svc, world.id, { forceOnline: true });
    // Music share + plaza growth: previously only fired from the cron
    // endpoint, which isn't scheduled on CF Workers yet (no Vercel cron,
    // no pg_cron). When the owner is actively on /world this poll runs
    // every 60s — close enough to a per-minute cron to drive these
    // organically. Each tick is cheap and idempotent (slot dedup +
    // milestone dedup).
    await tickMusicShare(svc, world.id);
    await tickYoutubeShare(svc, world.id);
    await tickPlazaGrowth(svc, world.id);
    // Plaza positions drift gently each poll so the room feels alive
    // even when the AIs aren't speaking. Cheap when nobody is eligible.
    await tickMemberPositions(svc, world.id);
    // Implicit-driven persona drift — at most one affinity append per
    // world per day (worlds.last_persona_drift_at). Cheap when on
    // cooldown (single SELECT).
    await tickPersonaDrift(svc, world.id);
  } catch (e) {
    console.warn("members bootstrap/tick failed:", e instanceof Error ? e.message : e);
  }

  // Read with service role: ownership of this world was already proven via
  // the earlier `worlds` query (RLS enforced there). Apply the activated /
  // status filter in JS rather than chained PostgREST — the latter has
  // returned empty arrays in some cases even with rows that should match.
  const { data: allMembers, error: memErr } = await svc
    .from("members")
    .select("id, name, persona, activity_weight, status, activated_at, x, y, flip")
    .eq("current_location_world_id", world.id);
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  const members = (allMembers ?? [])
    .filter((m) => m.activated_at !== null && m.status === "active")
    .sort((a, b) => b.activity_weight - a.activity_weight);

  // Energy view for the top-bar meter. Read *after* the ambient tick so a
  // moment consumed this poll is reflected. Apply the KST daily reset for
  // display so a fresh day shows full before the next tick rewrites the row.
  const { data: wEnergy } = await svc
    .from("worlds")
    .select("plan, moments_used, moments_day")
    .eq("id", world.id)
    .maybeSingle();
  const today = kstDayLabel(Date.now());
  const plan = (wEnergy?.plan ?? "free") as Plan;
  const usedToday = wEnergy?.moments_day === today ? (wEnergy?.moments_used ?? 0) : 0;
  const energy = energyView(plan, usedToday, Date.now());

  return NextResponse.json({
    worldId: world.id,
    name: world.name,
    members,
    energy,
  });
}
