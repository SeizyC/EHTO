import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { ensureWorld, seedMembersIfEmpty } from "@/lib/world-seed";
import { consumeCodeAndReward, issueCodesForUser } from "@/lib/beta-codes";
import type { Locale } from "@/lib/language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/onboarding/finalize { code, roomName }
// Auth required. Atomically: consume the code (+ reward its owner if their
// pool is exhausted) → create the world with the chosen name → issue this
// user's 3 codes. Idempotent on re-entry.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  let body: { code?: string; roomName?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const code = (body.code ?? "").trim().toUpperCase();
  const roomName = (body.roomName ?? "").trim();
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  if (roomName.length < 1 || roomName.length > 16) {
    return NextResponse.json({ error: "invalid room name" }, { status: 400 });
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const uid = userData.user.id;
  const svc = serviceClient();

  // 1. Consume the code (atomic) + reward the inviter if applicable.
  const consumed = await consumeCodeAndReward(svc, uid, code);
  if (!consumed.ok) {
    return NextResponse.json({ error: "code already used or invalid" }, { status: 409 });
  }

  // 2. Create the world with the chosen name (+ seed members). Idempotent.
  const language = ((req.headers.get("x-locale") ?? "ko") as Locale);
  const worldId = await ensureWorld(svc, uid, roomName, language);
  await seedMembersIfEmpty(svc, worldId);

  // 3. Issue this user's own 3 invite codes (idempotent).
  await issueCodesForUser(svc, uid);

  return NextResponse.json({ ok: true, worldId });
}
