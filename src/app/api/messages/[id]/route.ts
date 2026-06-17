import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";

// DELETE /api/messages/:id — owner deletes their own message.
// RLS policy "messages: owner delete own" enforces ownership; this route is
// a thin wrapper that just proves auth and forwards the call.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  // RLS makes this a no-op if the row isn't owned by this user.
  const { error, count } = await sb
    .from("messages")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: "not found or not owned" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
