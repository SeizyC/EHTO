import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";

// GET /api/character/handle-available?handle=… → { available, reason? }
//
// Real-time availability check for the character name (profiles.handle, which
// has a UNIQUE index). Auth'd so we can exclude the caller's own handle (the
// re-name case). The existence check runs with the service role so RLS on
// `profiles` can't mask another user's handle and report a false "available".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const handle = (req.nextUrl.searchParams.get("handle") ?? "").trim();
  if (handle.length < 2 || handle.length > 12) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  // Exact match (mirrors the case-sensitive unique index), excluding self.
  const { data } = await serviceClient()
    .from("profiles")
    .select("id")
    .eq("handle", handle)
    .neq("id", userData.user.id)
    .maybeSingle();

  return NextResponse.json({ available: !data });
}
