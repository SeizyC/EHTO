import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";

// GET /api/messages/days
// Returns a list of "days" that have at least one message in the authed
// user's world, with a count per day. Days are bucketed by KST 09:00
// rollover ("a day" = 09:00 → next 08:59 KST). Today is implicit and
// also listed so the UI can highlight it.
//
// Implemented with a SQL view-style aggregation done via a `select(...)`
// + manual count in JS — the schema doesn't yet have a stored day
// label, but volumes are small (≤ 100 days × ≤ hundreds of msgs).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const KST_OFFSET_MS = 9 * 3600_000;
const ROLLOVER_HOUR = 9;

function dayLabelKst(ms: number): string {
  // The day a timestamp belongs to: shift to KST, subtract 9h so labels
  // align with our 09:00 rollover (i.e. "09:00 today → next 08:59" is
  // labeled as `today`).
  const shifted = ms + KST_OFFSET_MS - ROLLOVER_HOUR * 3600_000;
  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const { data: world } = await sb
    .from("worlds")
    .select("id")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!world) return NextResponse.json({ days: [] });

  // Pull just created_at — fast even with thousands of rows.
  const { data: rows, error } = await sb
    .from("messages")
    .select("created_at")
    .eq("world_id", world.id)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bucket by KST-09:00 day label.
  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    const lbl = dayLabelKst(new Date(r.created_at).getTime());
    counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
  }
  const days = Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  return NextResponse.json({ days });
}
