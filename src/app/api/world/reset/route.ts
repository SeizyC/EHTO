import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { seedMembersIfEmpty } from "@/lib/world-seed";

// POST /api/world/reset
// Owner-only. Wipes the plaza back to a fresh state: deletes all messages
// (user + AI + system), placed objects, and members, then re-seeds a fresh
// dormant roster and restarts the arrival schedule from now (so the first
// friend arrives ~1 min again). Keeps the world row (name/language/plan),
// the owner's character, and their EHTO balance.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const { data: world, error: worldErr } = await sb
    .from("worlds")
    .select("id")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (worldErr) return NextResponse.json({ error: worldErr.message }, { status: 500 });
  if (!world) return NextResponse.json({ error: "no world" }, { status: 404 });

  const svc = serviceClient();
  const wid = world.id;

  // Child rows first. messages carry user/system lines too (not just
  // member-linked), so delete them explicitly; objects + visits are keyed by
  // world. Deleting members then cascades member_relations / traces / any
  // remaining member-linked rows.
  for (const step of [
    svc.from("messages").delete().eq("world_id", wid),
    svc.from("plaza_objects").delete().eq("world_id", wid),
    svc.from("visits").delete().eq("world_id", wid),
    svc.from("members").delete().eq("current_location_world_id", wid),
  ]) {
    const { error } = await step;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Restart the arrival schedule from now + clear daily/ambient counters so
  // the room starts quiet and the first friend arrives ~1 min later.
  const { error: updErr } = await svc
    .from("worlds")
    .update({
      created_at: new Date().toISOString(),
      moments_used: 0,
      moments_day: null,
      interject_used: 0,
      interject_day: null,
      last_ambient_at: null,
      last_owner_checkin_at: null,
    })
    .eq("id", wid);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Fresh dormant roster (no-op guard passes now that members are gone).
  await seedMembersIfEmpty(svc, wid);

  return NextResponse.json({ ok: true });
}
