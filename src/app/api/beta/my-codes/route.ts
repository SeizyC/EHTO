import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { listUserCodes, issueCodesForUser } from "@/lib/beta-codes";

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
  const svc = serviceClient();
  // Self-heal: a user who onboarded before codes were issued (or whose issue
  // step was skipped) would otherwise see an empty 0/0 panel. Issuing is
  // idempotent — a no-op once they already own their PER_USER codes.
  await issueCodesForUser(svc, userData.user.id);
  const codes = await listUserCodes(svc, userData.user.id);
  return NextResponse.json({ codes });
}
