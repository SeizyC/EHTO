import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Current status of every plaza (world): owner, active members, today's chatter,
// last activity, locale, plan, pause state. Sorted by most-recently-active.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const svc = serviceClient();
  const now = Date.now();

  // KST calendar-day start (midnight Asia/Seoul), as a UTC ISO string.
  const kstNow = new Date(now + 9 * 3600_000);
  const kstMidnightUtcMs = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600_000;
  const todayStartIso = new Date(kstMidnightUtcMs).toISOString();

  const { data: worlds } = await svc
    .from("worlds")
    .select("id, name, owner_id, created_at, language, region, plan, ambient_paused, last_owner_active_at");

  const ownerIds = [...new Set((worlds ?? []).map((w) => w.owner_id as string))];
  const { data: profs } = await svc.from("profiles").select("id, handle").in("id", ownerIds);
  const handleById = new Map((profs ?? []).map((p) => [p.id as string, (p.handle as string) ?? null]));

  // Active member counts per world (activated, not ghost/banned).
  const { data: mem } = await svc
    .from("members")
    .select("current_location_world_id, status, activated_at")
    .not("activated_at", "is", null)
    .not("status", "in", "(ghost,banned)");
  const memCount = new Map<string, number>();
  for (const m of mem ?? []) {
    const w = m.current_location_world_id as string;
    memCount.set(w, (memCount.get(w) ?? 0) + 1);
  }

  // Recent messages → last activity + today's count per world.
  const { data: msgs } = await svc
    .from("messages")
    .select("world_id, created_at")
    .order("created_at", { ascending: false })
    .limit(8000);
  const lastMsg = new Map<string, string>();
  const todayCount = new Map<string, number>();
  for (const m of msgs ?? []) {
    const w = m.world_id as string;
    const ts = m.created_at as string;
    if (!lastMsg.has(w)) lastMsg.set(w, ts);
    if (ts >= todayStartIso) todayCount.set(w, (todayCount.get(w) ?? 0) + 1);
  }

  const plazas = (worlds ?? [])
    .map((w) => ({
      id: w.id as string,
      name: (w.name as string) ?? null,
      owner: handleById.get(w.owner_id as string) ?? null,
      createdAt: w.created_at as string,
      language: (w.language as string) ?? "ko",
      region: (w.region as string) ?? "KR",
      plan: (w.plan as string) ?? "free",
      paused: !!w.ambient_paused,
      ownerActiveAt: (w.last_owner_active_at as string) ?? null,
      members: memCount.get(w.id as string) ?? 0,
      todayMessages: todayCount.get(w.id as string) ?? 0,
      lastMessageAt: lastMsg.get(w.id as string) ?? null,
    }))
    .sort((a, b) => {
      const at = new Date(a.lastMessageAt ?? a.createdAt).getTime();
      const bt = new Date(b.lastMessageAt ?? b.createdAt).getTime();
      return bt - at;
    });

  return NextResponse.json({ plazas, total: plazas.length });
}
