import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

// GET /api/admin/me — lightweight check used by the /admin client shell
// to decide whether the current session may view admin pages.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if (!r.ok) return NextResponse.json({ admin: false, reason: r.message }, { status: r.status });
  return NextResponse.json({ admin: true, email: r.email });
}
