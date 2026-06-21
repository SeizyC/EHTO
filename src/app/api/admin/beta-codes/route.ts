import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";
import { generateCodes } from "@/lib/beta-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const svc = serviceClient();
  const { data, error } = await svc
    .from("beta_codes")
    .select("code, owner_user_id, used_by, used_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ codes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  let body: { count?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // no body or invalid JSON — use default count
  }

  const rawCount = typeof body.count === "number" ? body.count : parseInt(String(body.count ?? ""), 10);
  const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.min(Math.max(Math.floor(rawCount), 1), 50) : 10;

  const svc = serviceClient();

  // Try batch insert; on PK collision, fall back to one-by-one.
  const codes = generateCodes(count);
  const rows = codes.map((code) => ({ code }));

  const { data: inserted, error: batchErr } = await svc
    .from("beta_codes")
    .insert(rows)
    .select("code");

  if (!batchErr) {
    return NextResponse.json({ created: (inserted ?? []).map((r) => (r as { code: string }).code) });
  }

  // Collision or other error — retry one-by-one, ignoring PK duplicates.
  const created: string[] = [];
  let guard = 0;
  const fresh = generateCodes(count + 10); // extra pool for retries
  for (const code of fresh) {
    if (created.length >= count) break;
    if (guard++ > count * 3) break;
    const { error } = await svc.from("beta_codes").insert({ code });
    if (!error) created.push(code);
    // skip PK conflicts silently
  }

  return NextResponse.json({ created });
}
