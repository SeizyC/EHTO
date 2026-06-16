import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { consumeOne, grant } from "@/lib/ticket-balance";
import { TICKETS, isTicketKind } from "@/lib/tickets";
import { kstDayLabel, memberCap, type Plan } from "@/lib/energy";

// POST /api/tickets/use  body: { kind }
// Spends one ticket of `kind` and performs its action on the caller's plaza.
// Flow: feasibility precheck → atomic consume → perform → refund on failure.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: { kind?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const kind = body.kind;
  if (!isTicketKind(kind)) {
    return NextResponse.json({ error: "unknown ticket" }, { status: 400 });
  }
  if (!TICKETS[kind].actionable) {
    return NextResponse.json({ error: "아직 준비 중인 티켓이에요" }, { status: 400 });
  }

  const svc = serviceClient();
  const { data: world } = await svc
    .from("worlds")
    .select("id, plan")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!world) return NextResponse.json({ error: "광장이 아직 없어요" }, { status: 400 });

  // ── feasibility precheck (avoid spending on an action that can't run) ──
  let benchId: string | null = null;
  let benchName = "";
  if (kind === "invite") {
    const cap = memberCap((world.plan ?? "free") as Plan);
    const { count: active } = await svc
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("current_location_world_id", world.id)
      .not("activated_at", "is", null)
      .not("status", "in", "(ghost,banned)");
    if ((active ?? 0) >= cap) {
      return NextResponse.json({ error: "정원이 찼어요" }, { status: 409 });
    }
    const { data: bench } = await svc
      .from("members")
      .select("id, name")
      .eq("current_location_world_id", world.id)
      .is("activated_at", null)
      .order("activation_offset_seconds", { ascending: true })
      .limit(1);
    if (!bench || bench.length === 0) {
      return NextResponse.json({ error: "기다리는 친구가 없어요" }, { status: 409 });
    }
    benchId = bench[0].id;
    benchName = bench[0].name;
  }

  // ── consume one (atomic) ──
  const balance = await consumeOne(svc, userId, kind);
  if (balance === null) {
    return NextResponse.json({ error: "티켓이 없어요" }, { status: 402 });
  }

  // ── perform; refund the ticket if the action fails ──
  try {
    if (kind === "refill") {
      // 이어서 보기 — top today's moments back to full.
      await svc
        .from("worlds")
        .update({ moments_used: 0, moments_day: kstDayLabel(Date.now()) })
        .eq("id", world.id);
    } else if (kind === "invite" && benchId) {
      const now = new Date().toISOString();
      await svc
        .from("members")
        .update({ activated_at: now, last_seen_at: now })
        .eq("id", benchId)
        .is("activated_at", null);
      await svc.from("messages").insert({
        world_id: world.id,
        kind: "system",
        text: `${benchName} 님이 입장하셨어요`,
      });
    }
  } catch (e) {
    await grant(svc, userId, kind, 1).catch(() => {});
    console.error("[tickets/use] action failed, refunded:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "처리에 실패해 티켓을 돌려드렸어요" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, kind, balance });
}
