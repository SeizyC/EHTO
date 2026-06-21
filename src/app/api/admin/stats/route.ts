import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const svc = serviceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // signups: 1 user = 1 world
  const { count: signups } = await svc
    .from("worlds")
    .select("id", { count: "exact", head: true });

  // profiles head count
  const { count: profiles } = await svc
    .from("profiles")
    .select("id", { count: "exact", head: true });

  // active visitors in last 7d (distinct user_id from visits)
  const { data: visitorRows } = await svc
    .from("visits")
    .select("user_id")
    .gte("started_at", sevenDaysAgo)
    .not("user_id", "is", null);
  const activeVisitors7d = new Set((visitorRows ?? []).map((r) => r.user_id)).size;

  // pageviews total
  const { count: pageviewsTotal } = await svc
    .from("page_views")
    .select("id", { count: "exact", head: true });

  // pageviews last 7d
  const { count: pageviews7d } = await svc
    .from("page_views")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);

  // top 10 paths over last 7d
  const { data: pathRows } = await svc
    .from("page_views")
    .select("path")
    .gte("created_at", sevenDaysAgo)
    .limit(5000);
  const pathCounts = new Map<string, number>();
  for (const r of pathRows ?? []) {
    const p = r.path as string;
    pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
  }
  const topPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  // country breakdown over last 7d
  const { data: countryRows } = await svc
    .from("page_views")
    .select("country")
    .gte("created_at", sevenDaysAgo)
    .limit(5000);
  const countryCounts = new Map<string, number>();
  for (const r of countryRows ?? []) {
    const c = (r.country as string | null) ?? "??";
    countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  }
  const byCountry = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([country, count]) => ({ country, count }));

  return NextResponse.json({
    signups: signups ?? 0,
    profiles: profiles ?? 0,
    activeVisitors7d,
    pageviewsTotal: pageviewsTotal ?? 0,
    pageviews7d: pageviews7d ?? 0,
    topPaths,
    byCountry,
  });
}
