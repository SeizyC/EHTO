import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { parseBias } from "@/lib/world-bias";

// PATCH /api/world/settings
// Body: { isPublic?: boolean; tags?: string[]; bias?: WorldBias | null }
//
// Updates the authed user's world. Owner-only (the where clause is keyed
// to owner_id). Validates tags: max 3, each 1-12 chars, simple
// alphanumeric/한글, no whitespace inside. is_public is a simple boolean.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAG_RE = /^[가-힣A-Za-z0-9._\-]{1,12}$/;
const TAG_MAX = 3;
const LANGS = ["ko", "en", "ja"] as const;

export async function PATCH(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: { isPublic?: unknown; tags?: unknown; bias?: unknown; language?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (typeof body.isPublic === "boolean") {
    update.is_public = body.isPublic;
  }
  if ("bias" in body) {
    // null = clear bias; otherwise validate via parseBias which returns
    // null for invalid shapes (kind we don't recognize, artist > 40
    // chars, etc.). Distinguish "clearing" from "not provided" by
    // explicit `bias in body` check above.
    if (body.bias === null) {
      update.bias = null;
    } else {
      const parsed = parseBias(body.bias);
      if (!parsed) return NextResponse.json({ error: "invalid bias" }, { status: 400 });
      update.bias = parsed;
    }
  }
  if (Array.isArray(body.tags)) {
    const raw = body.tags as unknown[];
    if (raw.length > TAG_MAX) {
      return NextResponse.json({ error: `최대 ${TAG_MAX}개 태그` }, { status: 400 });
    }
    const cleaned: string[] = [];
    for (const t of raw) {
      if (typeof t !== "string") continue;
      const trimmed = t.trim();
      if (!trimmed) continue;
      if (!TAG_RE.test(trimmed)) {
        return NextResponse.json({ error: `잘못된 태그: ${trimmed}` }, { status: 400 });
      }
      cleaned.push(trimmed);
    }
    update.tags = Array.from(new Set(cleaned));
  }
  if (typeof body.language === "string") {
    if (!(LANGS as readonly string[]).includes(body.language)) {
      return NextResponse.json({ error: "bad language" }, { status: 400 });
    }
    update.language = body.language;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no changes" }, { status: 400 });
  }

  // Use service role for the write (RLS-bypassing) but key the WHERE
  // clause by owner_id so we can only update our own world.
  const svc = serviceClient();
  const { data, error } = await svc
    .from("worlds")
    .update(update)
    .eq("owner_id", userId)
    .select("id, is_public, tags, bias, language")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "no world" }, { status: 404 });

  return NextResponse.json({ ok: true, world: data });
}
