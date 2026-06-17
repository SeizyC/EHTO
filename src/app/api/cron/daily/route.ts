import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { tickDailySummaries } from "@/lib/memory-engine";

// GET /api/cron/daily
//
// Runs the once-per-day memory tick across every world. Each active
// member who spoke yesterday gets a one-line first-person summary
// stored in `member_memory_traces`, used by future ambient prompts to
// reference what they did "yesterday". Intended to be hit by Vercel
// Cron at KST 09:05 (or thereabouts) — idempotent so retries are safe.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ")
      ? auth.slice(7)
      : req.nextUrl.searchParams.get("key");
    if (provided !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const svc = serviceClient();
  const { data: worlds, error } = await svc.from("worlds").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type WorldResult = { worldId: string; summarized?: string[]; error?: string };
  const results: WorldResult[] = [];
  for (const w of worlds ?? []) {
    try {
      const r = await tickDailySummaries(svc, w.id);
      results.push({ worldId: w.id, summarized: r.summarized });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[cron/daily] world ${w.id}:`, msg);
      results.push({ worldId: w.id, error: msg });
    }
  }

  return NextResponse.json({ ok: true, worlds: results.length, results });
}
