import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";

// PUT /api/world/me/position { x, y, flip }
// Upserts the authed owner's plaza position on their world row.
// Coords are percent (0-100) clamped to the floor band that /world
// uses, so a malformed client can't push the avatar off the canvas.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const X_MIN = 0;
const X_MAX = 100;
const Y_MIN = 0;
const Y_MAX = 100;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export async function PUT(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  let body: { x?: number; y?: number; flip?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  if (typeof body.x !== "number" || typeof body.y !== "number" || typeof body.flip !== "boolean") {
    return NextResponse.json({ error: "x,y,flip required" }, { status: 400 });
  }
  if (!Number.isFinite(body.x) || !Number.isFinite(body.y)) {
    return NextResponse.json({ error: "x,y must be finite" }, { status: 400 });
  }
  const x = clamp(body.x, X_MIN, X_MAX);
  const y = clamp(body.y, Y_MIN, Y_MAX);
  const flip = body.flip;

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const { data, error } = await sb
    .from("worlds")
    .update({
      owner_x: x,
      owner_y: y,
      owner_flip: flip,
      owner_pos_updated_at: new Date().toISOString(),
    })
    .eq("owner_id", userData.user.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "no world" }, { status: 404 });

  return NextResponse.json({ ok: true, x, y, flip });
}
