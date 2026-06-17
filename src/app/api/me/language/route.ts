import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";

// PATCH /api/me/language
// Body: { language: "ko" | "en" | "ja" }
//
// Persists the authed user's chosen language to profiles.language so a
// saved choice beats IP detection. Auth/client pattern mirrors
// /api/world/settings: Bearer token -> userClient().auth.getUser() for the
// id, serviceClient() for the (RLS-bypassing) write keyed to that id.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: { language?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  if (typeof body.language !== "string" || !(LANGS as readonly string[]).includes(body.language)) {
    return NextResponse.json({ error: "bad language" }, { status: 400 });
  }

  const svc = serviceClient();
  const { error } = await svc
    .from("profiles")
    .update({ language: body.language })
    .eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
