import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { getEhtoBalance } from "@/lib/ehto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ehto/balance → { balance }
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });
  const sb = userClient(token);
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });
  const balance = await getEhtoBalance(serviceClient(), userData.user.id);
  return NextResponse.json({ balance });
}
