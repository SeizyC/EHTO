import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";

// PUT /api/world/name { name }
// Upserts the authed user's world with the given name.
// Trigger auto-logs to world_name_history.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  let body: { name?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const name = (body.name ?? "").trim();
  if (name.length < 1 || name.length > 16) {
    return NextResponse.json({ error: "1–16자" }, { status: 400 });
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  // Upsert by owner_id (unique). Handles both:
  //   · new users (world row doesn't yet exist) → insert
  //   · existing users → update
  const { data: row, error: upErr } = await sb
    .from("worlds")
    .upsert(
      { owner_id: userData.user.id, name },
      { onConflict: "owner_id" },
    )
    .select("id, name")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "no row affected" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name: row.name, worldId: row.id });
}
