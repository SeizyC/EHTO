import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";

// POST /api/world/objects/types/[id]/mute
//
// Removes every placement of `typeId` from the caller's own world and
// inserts a user_object_mutes row so the type won't reappear via
// plaza-grow's dynamic / variant pick paths.
//
// Static types (origin='static') are protected — the baseline plaza
// shouldn't lose its fountain/bench just because the user got tired
// of looking at it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: typeId } = await params;
  if (!typeId) return NextResponse.json({ error: "missing typeId" }, { status: 400 });

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
  if (!world) return NextResponse.json({ error: "no world" }, { status: 404 });

  const svc = serviceClient();

  // Refuse to mute static catalog types (origin='static') — keep the
  // baseline plaza intact. Surface a clear error so the UI never even
  // shows the [제거] button for these.
  const { data: type } = await svc
    .from("object_types")
    .select("origin")
    .eq("id", typeId)
    .maybeSingle();
  if (!type) return NextResponse.json({ error: "type not found" }, { status: 404 });
  if (type.origin === "static") {
    return NextResponse.json({ error: "static types are protected" }, { status: 400 });
  }

  // 1) Insert the mute row (owner RLS via the user client).
  const { error: muteErr } = await sb
    .from("user_object_mutes")
    .upsert(
      { user_id: userData.user.id, world_id: world.id, type_id: typeId },
      { onConflict: "user_id,world_id,type_id" },
    );
  if (muteErr) return NextResponse.json({ error: muteErr.message }, { status: 500 });

  // 2) Delete every placement of this type from THIS world. We do the
  //    delete via service role because plaza_objects rows reference
  //    variant_id (not type_id) — join through object_variants to
  //    enumerate the variant ids belonging to this type.
  const { data: variants } = await svc
    .from("object_variants")
    .select("id")
    .eq("type_id", typeId);
  const variantIds = (variants ?? []).map((v) => (v as { id: string }).id);
  if (variantIds.length > 0) {
    const { error: delErr, count } = await svc
      .from("plaza_objects")
      .delete({ count: "exact" })
      .eq("world_id", world.id)
      .in("variant_id", variantIds);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, removed: count ?? 0 });
  }

  return NextResponse.json({ ok: true, removed: 0 });
}
