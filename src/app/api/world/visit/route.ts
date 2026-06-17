import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";

// POST /api/world/visit
//
// Logs that the authed owner just opened/observed their world. To avoid
// double-counting reload spam, we collapse multiple opens within 30 min
// into a single visit row by checking the table for a recent visit by
// the same user before inserting.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DEDUP_MS = 30 * 60_000;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: world } = await sb
    .from("worlds")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!world) return NextResponse.json({ ok: false });

  const svc = serviceClient();
  const cutoff = new Date(Date.now() - DEDUP_MS).toISOString();
  // Has this user logged a visit to this world within the dedup window?
  const { data: recent } = await svc
    .from("visits")
    .select("id")
    .eq("world_id", world.id)
    .eq("user_id", userId)
    .gte("started_at", cutoff)
    .limit(1);

  if (recent && recent.length > 0) {
    return NextResponse.json({ ok: true, counted: false });
  }
  await svc.from("visits").insert({ world_id: world.id, user_id: userId });
  return NextResponse.json({ ok: true, counted: true });
}
