import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { listUserCodes } from "@/lib/beta-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/beta/my-codes → { codes: { code, used }[] }
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const codes = await listUserCodes(serviceClient(), userData.user.id);
  return NextResponse.json({ codes });
}
