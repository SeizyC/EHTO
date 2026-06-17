import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";

// POST /api/world/members/[id]/ban
//
// Owner-only: marks one member as 'banned'. Banned members are excluded
// from ambient speakers, plaza render, and rotation refill targets (the
// status='banned' filter applies everywhere we check for active members).
// A natural-sounding system message goes in the feed so other members'
// next ambient lines can react to the departure.
//
// Distinct from 'ghost': ghost = quietly rotated out by the rotation
// system, can theoretically return. banned = explicit owner kick,
// permanent.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const userId = userData.user.id;

  const { id: memberId } = await params;

  // Ownership check: the member's world must be owned by the caller.
  const { data: member } = await sb
    .from("members")
    .select("id, name, current_location_world_id, status")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "member not found" }, { status: 404 });
  const { data: world } = await sb
    .from("worlds")
    .select("id, owner_id")
    .eq("id", member.current_location_world_id)
    .maybeSingle();
  if (!world || world.owner_id !== userId) {
    return NextResponse.json({ error: "not your world" }, { status: 403 });
  }
  if (member.status === "banned") {
    return NextResponse.json({ ok: true, alreadyBanned: true });
  }

  // Apply ban via service role (bypass RLS). Also insert a system msg
  // so the feed shows a graceful "X 님이 광장을 떠났어요" line — same
  // shape as natural rotation departures, so the room doesn't read
  // suddenly punitive.
  const svc = serviceClient();
  const { error: updErr } = await svc
    .from("members")
    .update({ status: "banned" })
    .eq("id", memberId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await svc.from("messages").insert({
    world_id: world.id,
    kind: "system",
    text: `${member.name} 님이 광장을 떠났어요`,
  });

  return NextResponse.json({ ok: true, name: member.name });
}
