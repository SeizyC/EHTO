import { NextRequest, NextResponse } from "next/server";
import { serviceClient, userClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: true });
    }

    if (!body || typeof body !== "object" || !("path" in body)) {
      return NextResponse.json({ ok: true });
    }

    const rawPath = (body as Record<string, unknown>).path;
    if (!rawPath || typeof rawPath !== "string") {
      return NextResponse.json({ ok: true });
    }

    const path = rawPath.slice(0, 200);
    const country = req.headers.get("cf-ipcountry") ?? null;

    let userId: string | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token) {
      try {
        const { data } = await userClient(token).auth.getUser();
        userId = data.user?.id ?? null;
      } catch {
        // best-effort; leave userId null
      }
    }

    const svc = serviceClient();
    try {
      await svc.from("page_views").insert({ path, country, user_id: userId });
    } catch {
      // fire-and-forget; never throw to client
    }
  } catch {
    // outer safety net
  }

  return NextResponse.json({ ok: true });
}
