import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { aggregateImplicit } from "@/lib/implicit-pref";

// GET /api/world/topics
//
// Powers the RoomInfoSheet "광장이 자주 떠올리는 결" panel. Returns the
// top topics + a coldStart flag the client uses to show the "아직 결을
// 찾는 중..." copy in the first 3 days.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!world) return NextResponse.json({ topics: [], coldStart: true });

  // Use the service client so aggregateImplicit can hit auth.admin
  // (account-age check) without forwarding the user JWT.
  const svc = serviceClient();
  const state = await aggregateImplicit(svc, world.id);
  return NextResponse.json({
    topics: state.topics,
    coldStart: state.coldStart,
  });
}
