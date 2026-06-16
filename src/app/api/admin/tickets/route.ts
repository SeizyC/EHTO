import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";
import { grant } from "@/lib/ticket-balance";
import { isTicketKind } from "@/lib/tickets";

// POST /api/admin/tickets  body: { userId, kind, count }
// Manual ticket grant (admin-gated) — the stand-in for purchase until
// payments (PortOne) land. Plus's monthly bundle will also flow through grant().
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  let body: { userId?: string; kind?: string; count?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { userId, kind } = body;
  const count = Number(body.count);
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (!isTicketKind(kind)) return NextResponse.json({ error: "unknown ticket" }, { status: 400 });
  if (!Number.isInteger(count) || count <= 0 || count > 1000) {
    return NextResponse.json({ error: "count must be 1–1000" }, { status: 400 });
  }

  const svc = serviceClient();
  const balance = await grant(svc, userId, kind, count);
  return NextResponse.json({ ok: true, userId, kind, balance });
}
