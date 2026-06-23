import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { spendEhto, RANDOM_VISIT_PRICE } from "@/lib/ehto";

// POST /api/plazas/random → { id, balance }
// "주사위": spend EHTO to teleport to a random OTHER public plaza. Picks the
// destination first, then debits (atomic spend_ehto) — so a 402 never charges,
// and we never charge without a place to send them.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const { data: u, error } = await userClient(token).auth.getUser();
  if (error || !u.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });
  const uid = u.user.id;

  const svc = serviceClient();
  // Candidate public plazas (not mine). Small window + JS random pick keeps it
  // simple; revisit with a SQL random sampler if the public set grows large.
  const { data: rows } = await svc
    .from("worlds")
    .select("id")
    .eq("is_public", true)
    .neq("owner_id", uid)
    .limit(100);
  const ids = (rows ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) {
    return NextResponse.json({ error: "아직 갈 수 있는 광장이 없어요" }, { status: 404 });
  }
  const id = ids[Math.floor(Math.random() * ids.length)];

  const after = await spendEhto(svc, uid, RANDOM_VISIT_PRICE);
  if (after === null) return NextResponse.json({ error: "EHTO가 부족해요" }, { status: 402 });

  return NextResponse.json({ id, balance: after });
}
