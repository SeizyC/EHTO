import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Visitor counts bucketed by KST calendar day (midnight-to-midnight, Asia/Seoul).
//   · pageviews = page_views rows that day
//   · visitors  = distinct logged-in user_id that day (anon views can't be deduped)
// Returns today, yesterday, and a 7-day daily series for context.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const svc = serviceClient();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // KST has no DST, so a flat 24h step maps cleanly onto calendar days.
  const kstDate = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));

  // Last 7 KST dates, oldest → newest.
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) dates.push(kstDate(now - i * dayMs));
  const today = dates[dates.length - 1];
  const yesterday = dates[dates.length - 2];

  // Pull the window once (8 days back to safely cover the oldest KST day).
  const since = new Date(now - 8 * dayMs).toISOString();
  const { data: rows } = await svc
    .from("page_views")
    .select("created_at, user_id")
    .gte("created_at", since)
    .limit(100000);

  const byDay = new Map<string, { pv: number; users: Set<string> }>();
  for (const r of rows ?? []) {
    const d = kstDate(new Date(r.created_at as string).getTime());
    let b = byDay.get(d);
    if (!b) { b = { pv: 0, users: new Set() }; byDay.set(d, b); }
    b.pv++;
    if (r.user_id) b.users.add(r.user_id as string);
  }

  const stat = (d: string) => {
    const b = byDay.get(d);
    return { date: d, pageviews: b ? b.pv : 0, visitors: b ? b.users.size : 0 };
  };

  return NextResponse.json({
    today: stat(today),
    yesterday: stat(yesterday),
    daily7: dates.map(stat),
  });
}
