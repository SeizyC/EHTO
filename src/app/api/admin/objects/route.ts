import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";
import { catalogAll } from "@/lib/object-catalog";

// GET /api/admin/objects — return every object type with variants

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const types = await catalogAll(serviceClient());
  return NextResponse.json({ types });
}
