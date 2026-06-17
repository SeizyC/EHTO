import { NextRequest, NextResponse } from "next/server";
import { userClient, publicSpriteUrl } from "@/lib/supabase";

// GET /api/character/me
//
// Returns the authed user's active character + their handle, or null if
// they haven't created one yet. The /character page calls this on mount
// when localStorage has no cached character, so a fresh-browser login
// for an existing user lands at /world instead of being asked to recreate.

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

  const { data: ch } = await sb
    .from("characters")
    .select("id, image_path, gender, skin, outfit, rolled_hair, created_at")
    .eq("owner_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!ch) return NextResponse.json({ character: null });

  const { data: prof } = await sb
    .from("profiles")
    .select("handle")
    .eq("id", userData.user.id)
    .maybeSingle();

  return NextResponse.json({
    character: {
      id: ch.id,
      imageUrl: publicSpriteUrl(ch.image_path),
      gender: ch.gender,
      skin: ch.skin,
      outfit: ch.outfit,
      rolledHair: ch.rolled_hair ?? undefined,
      handle: prof?.handle ?? undefined,
      createdAt: ch.created_at ? new Date(ch.created_at).getTime() : Date.now(),
    },
  });
}
