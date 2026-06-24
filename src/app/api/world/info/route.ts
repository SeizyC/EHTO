import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";

// GET /api/world/info — current authed user's world summary
//   { id, name, createdAt, owner (true), members{active,dormant,total}, history[], visits{today,week} }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

  const { data: world } = await sb
    .from("worlds")
    .select("id, name, created_at, is_public, tags, bias, language, owner_x, owner_y, owner_flip, ambient_paused")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!world) return NextResponse.json({ world: null });

  // Member counts. Service role bypasses any RLS quirks (the user
  // already proved ownership via the worlds query above). Chained
  // PostgREST filters have been unreliable, so we fetch all rows and
  // tally client-side for guaranteed correctness.
  const svc = serviceClient();
  const { data: memberRows } = await svc
    .from("members")
    .select("activated_at, status")
    .eq("current_location_world_id", world.id);
  const rows = memberRows ?? [];
  const active = rows.filter((m) => m.activated_at !== null && m.status === "active").length;
  const dormant = rows.filter((m) => m.activated_at === null).length;
  const total = rows.length;

  // Visit stats — derived from the unified `visits` table. Cumulative
  // counts include AI activations + the owner's deduped sessions.
  const todayStart = (() => {
    const KST = 9 * 3600_000;
    const now = new Date();
    const kst = new Date(now.getTime() + KST);
    const startKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 9, 0, 0);
    let startUtc = startKst - KST;
    if (startUtc > now.getTime()) startUtc -= 24 * 3600_000;
    return new Date(startUtc).toISOString();
  })();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const [todayVisits, weekVisits, allVisits] = await Promise.all([
    svc.from("visits").select("id", { count: "exact", head: true })
      .eq("world_id", world.id).gte("started_at", todayStart),
    svc.from("visits").select("id", { count: "exact", head: true })
      .eq("world_id", world.id).gte("started_at", weekAgo),
    svc.from("visits").select("id", { count: "exact", head: true })
      .eq("world_id", world.id),
  ]);

  // Name history (newest first)
  const { data: history } = await sb
    .from("world_name_history")
    .select("name, set_at")
    .eq("world_id", world.id)
    .order("set_at", { ascending: false });

  return NextResponse.json({
    world: {
      id: world.id,
      name: world.name,
      createdAt: world.created_at,
      owner: true,
      isPublic: !!(world as { is_public?: boolean }).is_public,
      paused: !!(world as { ambient_paused?: boolean }).ambient_paused,
      tags: ((world as { tags?: string[] }).tags ?? []) as string[],
      bias: ((world as { bias?: unknown }).bias ?? null) as unknown,
      language: (((world as { language?: string }).language ?? "ko") as "ko" | "en" | "ja"),
      ownerPos: {
        x: (world as { owner_x?: number }).owner_x ?? 50,
        y: (world as { owner_y?: number }).owner_y ?? 60,
        flip: !!(world as { owner_flip?: boolean }).owner_flip,
      },
      members: {
        active: active ?? 0,
        dormant: dormant ?? 0,
        total: total ?? 0,
      },
      history: history ?? [],
      visits: {
        today: todayVisits.count ?? 0,
        week: weekVisits.count ?? 0,
        total: allVisits.count ?? 0,
      },
    },
  });
}
