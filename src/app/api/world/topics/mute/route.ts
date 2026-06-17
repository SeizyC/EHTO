import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";
import { invalidateImplicit } from "@/lib/implicit-pref";

// POST /api/world/topics/mute { topic }
//
// Inserts (user_id, world_id, topic) into user_topic_mutes. The next
// aggregate read will drop that topic from every application site +
// the transparency panel. Idempotent (PK upsert pattern via INSERT ...
// ON CONFLICT DO NOTHING).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  let body: { topic?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const topic = (body.topic ?? "").trim();
  if (!topic || topic.length > 40) {
    return NextResponse.json({ error: "topic required (≤ 40 chars)" }, { status: 400 });
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const { data: world } = await sb
    .from("worlds")
    .select("id")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!world) return NextResponse.json({ error: "no world" }, { status: 404 });

  // RLS policy "user_topic_mutes: owner insert" gates this — user can
  // only insert mutes for their own user_id, which we hand to the
  // upsert explicitly.
  const { error } = await sb
    .from("user_topic_mutes")
    .upsert(
      { user_id: userData.user.id, world_id: world.id, topic_keyword: topic },
      { onConflict: "user_id,world_id,topic_keyword" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Drop the cache so the next aggregate read picks up the mute.
  invalidateImplicit(world.id);
  return NextResponse.json({ ok: true });
}
