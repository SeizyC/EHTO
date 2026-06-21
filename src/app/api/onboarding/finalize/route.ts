import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { ensureWorld, seedMembersIfEmpty } from "@/lib/world-seed";
import { consumeCodeAndReward, issueCodesForUser } from "@/lib/beta-codes";
import { countryToLocale } from "@/lib/language";
import { getEhtoBalance, grantEhto, START_GRANT } from "@/lib/ehto";

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
  //    Language follows the request's IP→locale, same as the landing page
  //    (cf-ipcountry). The world is created HERE (before /character), so this
  //    is the one place the plaza language is set — a never-set x-locale
  //    header would have forced every non-KO beta plaza to Korean.
  const language = countryToLocale(req.headers.get("cf-ipcountry"));
  const worldId = await ensureWorld(svc, uid, roomName, language);
  // Member seeding is best-effort: a seed hiccup must not 500 finalize after
  // the code is already consumed. The world exists; the next /world poll's
  // seedMembersIfEmpty backfills. Mirrors generate-character's guarded seed.
  try { await seedMembersIfEmpty(svc, worldId); }
  catch (e) { console.warn("[finalize] seed failed:", e instanceof Error ? e.message : e); }

  // 3. Issue this user's own 3 invite codes (idempotent).
  await issueCodesForUser(svc, uid);

  // Starting EHTO — granted once. New users have a 0 balance here (the backfill
  // only touched pre-existing profiles), so this is effectively idempotent.
  if ((await getEhtoBalance(svc, uid)) === 0) {
    await grantEhto(svc, uid, START_GRANT);
  }

  return NextResponse.json({ ok: true, worldId });
}
