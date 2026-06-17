// Server-side admin gate. Reads ADMIN_EMAILS env (comma-separated). Used
// by every /api/admin/* route and by the /admin client shell (via
// /api/admin/me).

import type { NextRequest } from "next/server";
import { userClient } from "@/lib/supabase";

export type AdminCheck =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: 401 | 403; message: string };

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(req: NextRequest): Promise<AdminCheck> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, status: 401, message: "missing auth" };

  const sb = userClient(token);
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData.user) {
    return { ok: false, status: 401, message: "invalid session" };
  }
  const email = (userData.user.email ?? "").toLowerCase();
  const allowed = adminEmails();
  if (!email || !allowed.includes(email)) {
    return { ok: false, status: 403, message: "not an admin" };
  }
  return { ok: true, userId: userData.user.id, email };
}
