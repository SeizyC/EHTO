import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { validateCode } from "@/lib/beta-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/beta/validate { code } → { ok: boolean }
// Public (no auth): checks a code exists and is unused, WITHOUT consuming it.
// Consumption happens later in /api/onboarding/finalize after auth.
export async function POST(req: NextRequest) {
  let body: { code?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false });
  const ok = await validateCode(serviceClient(), code);
  return NextResponse.json({ ok });
}
