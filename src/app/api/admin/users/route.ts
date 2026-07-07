import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// User roster for the admin "사용자 현황" list: signup date + email (auth.users),
// handle + language (profiles), and country (most recent page_view country for
// that user). Newest signups first.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const svc = serviceClient();

  // 1) Auth users (email + signup time). Beta scale fits one page.
  const { data: authData, error: authErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 502 });
  }
  const authUsers = authData?.users ?? [];

  // 2) Profiles (handle + language), keyed by id.
  const { data: profileRows } = await svc.from("profiles").select("id, handle, language");
  const profileById = new Map<string, { handle: string | null; language: string | null }>();
  for (const p of profileRows ?? []) {
    profileById.set(p.id as string, { handle: (p.handle as string) ?? null, language: (p.language as string) ?? null });
  }

  // 3) Country per user = most recent non-null page_view country. Pull newest
  //    first so the first time we see a user_id is their latest country.
  const { data: pvRows } = await svc
    .from("page_views")
    .select("user_id, country, created_at")
    .not("user_id", "is", null)
    .not("country", "is", null)
    .order("created_at", { ascending: false })
    .limit(50000);
  const countryByUser = new Map<string, string>();
  for (const r of pvRows ?? []) {
    const uid = r.user_id as string;
    if (!countryByUser.has(uid)) countryByUser.set(uid, r.country as string);
  }

  const users = authUsers
    .map((u) => {
      const prof = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        signupAt: u.created_at,
        confirmedAt: u.email_confirmed_at ?? null,
        country: countryByUser.get(u.id) ?? null,
        handle: prof?.handle ?? null,
        language: prof?.language ?? null,
      };
    })
    .sort((a, b) => new Date(b.signupAt).getTime() - new Date(a.signupAt).getTime());

  return NextResponse.json({ users, total: users.length });
}
