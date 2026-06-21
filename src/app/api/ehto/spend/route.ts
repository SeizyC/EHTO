import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { isEhtoAction, priceOf, spendEhto, grantEhto, type EhtoAction } from "@/lib/ehto";
import { memberCap, type Plan } from "@/lib/energy";
import { sysMemberJoined } from "@/lib/system-messages";
import type { Locale } from "@/lib/language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ehto/spend { action } → spend EHTO and perform the action.
// Only the actionable in-plaza acts are wired here; character_change is
// handled in the character flow. Flow: precheck → atomic spend → perform →
// refund on failure.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });
  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });
  const userId = userData.user.id;

  let body: { action?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const action = body.action;
  if (!action || !isEhtoAction(action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  if (action !== "member_invite" && action !== "energy_refill") {
    return NextResponse.json({ error: "아직 준비 중이에요" }, { status: 400 });
  }
  const price = priceOf(action as EhtoAction)!;

  const svc = serviceClient();
  const { data: world } = await svc
    .from("worlds")
    .select("id, plan, language, moments_used")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!world) return NextResponse.json({ error: "광장이 아직 없어요" }, { status: 400 });
  const language = ((world.language ?? "ko") as Locale);

  // ── precheck (don't spend on an action that can't run) ──
  let benchId: string | null = null;
  let benchName = "";
  if (action === "member_invite") {
    const cap = memberCap((world.plan ?? "free") as Plan);
    const { count: active } = await svc
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("current_location_world_id", world.id)
      .not("activated_at", "is", null)
      .not("status", "in", "(ghost,banned)");
    if ((active ?? 0) >= cap) return NextResponse.json({ error: "정원이 찼어요" }, { status: 409 });
    // Mirror tickets/use: order by activation_offset_seconds ascending so the
    // earliest-queued bench member is always selected first.
    const { data: bench } = await svc
      .from("members")
      .select("id, name")
      .eq("current_location_world_id", world.id)
      .is("activated_at", null)
      .order("activation_offset_seconds", { ascending: true })
      .limit(1);
    if (!bench || bench.length === 0) {
      return NextResponse.json({ error: "대기 중인 친구가 없어요" }, { status: 409 });
    }
    benchId = bench[0].id as string;
    benchName = (bench[0].name as string) ?? "";
  }

  // ── atomic spend ──
  const after = await spendEhto(svc, userId, price);
  if (after === null) return NextResponse.json({ error: "EHTO가 부족해요" }, { status: 402 });

  // ── perform (refund on failure) ──
  try {
    if (action === "member_invite") {
      const now = new Date().toISOString();
      // Mirror tickets/use: set both activated_at and last_seen_at together.
      await svc.from("members").update({ activated_at: now, last_seen_at: now }).eq("id", benchId).is("activated_at", null);
      await svc.from("messages").insert({ world_id: world.id, kind: "system", text: sysMemberJoined(language, benchName) });
    } else if (action === "energy_refill") {
      const cur = (world.moments_used as number | null) ?? 0;
      await svc.from("worlds").update({ moments_used: Math.max(0, cur - 30) }).eq("id", world.id);
    }
  } catch (e) {
    await grantEhto(svc, userId, price).catch(() => {});
    console.error("[ehto/spend] action failed, refunded:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "처리에 실패해 EHTO를 돌려드렸어요" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance: after });
}
