import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";
import { getBalances } from "@/lib/ticket-balance";
import { TICKETS } from "@/lib/tickets";

// GET /api/tickets — the caller's ticket balances + the catalog metadata so
// the client can render the wallet without a second source of truth.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const balances = await getBalances(sb, userData.user.id);
  return NextResponse.json({ balances, catalog: TICKETS });
}
