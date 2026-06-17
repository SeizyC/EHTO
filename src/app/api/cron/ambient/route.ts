import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { tickAmbientConversation } from "@/lib/ambient-loop";
import { tickMemberActivations } from "@/lib/world-seed";
import { tickRotation } from "@/lib/rotation";
import { tickMusicShare } from "@/lib/music-share";
import { tickYoutubeShare } from "@/lib/youtube-share";
import { tickPlazaGrowth } from "@/lib/plaza-grow";

// GET /api/cron/ambient
//
// Runs the ambient + activation ticks across EVERY world that has at least
// one activated member. Intended to be hit by Vercel Cron (or a manual curl
// in dev) every minute or so. Keeps the rooms alive even when no user is
// on /world — central to the PRD framing that the owner is an observer of
// a living plaza, not a chat partner.
//
// Authorization: requires CRON_SECRET in the Authorization header (or as
// ?key= query param) to prevent open invocation. In dev with no secret
// set, allow localhost calls for convenience.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// CRITICAL: Next dev wraps global fetch with caching by default. Without
// this, supabase-js GETs inside the tick get cached → the loop re-reads
// stale `messages` and decides the user is still "last" even after we
// just inserted an AI line. Force every fetch in this segment to bypass.
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("key");
    if (provided !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const svc = serviceClient();

  // Iterate every world. With <100 worlds this is fine; later this becomes
  // a smarter selector (only worlds with recent activity, sharded, etc.)
  const { data: worlds, error } = await svc
    .from("worlds")
    .select("id, created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type TickResult = {
    worldId: string;
    activated?: number;
    spoke?: string;
    departed?: number;
    refilled?: number;
    music?: string;
    yt?: string;
    grew?: string;
    reason?: string;
    error?: string;
  };
  const results: TickResult[] = [];
  for (const w of worlds ?? []) {
    try {
      const act = await tickMemberActivations(svc, w.id, w.created_at);
      const rot = await tickRotation(svc, w.id);
      const amb = await tickAmbientConversation(svc, w.id);
      // Music share: gated to KST morning/lunch/evening slots, once per
      // slot per day. Cheap no-op outside windows / when already shared.
      const mus = await tickMusicShare(svc, w.id);
      // YouTube share: noon + late-evening slots, once per slot per day.
      const yt = await tickYoutubeShare(svc, w.id);
      // Plaza growth: places one new object per milestone earned.
      // No-op unless age + message thresholds are crossed.
      const grow = await tickPlazaGrowth(svc, w.id);
      results.push({
        worldId: w.id,
        activated: act.activated.length || undefined,
        departed: rot.departed.length || undefined,
        refilled: rot.refilled || undefined,
        spoke: amb.spoke?.name,
        music: mus.shared ? `${mus.shared.name}: ${mus.shared.track}` : undefined,
        yt: yt.shared ? `${yt.shared.name}: ${yt.shared.video}` : undefined,
        grew: grow.placed.length > 0 ? grow.placed.join(",") : undefined,
        reason: amb.reason,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[cron] world ${w.id}:`, msg);
      results.push({ worldId: w.id, error: msg });
    }
  }

  return NextResponse.json({ ok: true, worlds: results.length, results });
}
