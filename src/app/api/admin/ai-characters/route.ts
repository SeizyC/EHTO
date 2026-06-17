import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";

// GET  /api/admin/ai-characters  — list every ai_character + active member count
// POST /api/admin/ai-characters  — create a new character (no sprite yet;
//                                   admin then clicks regenerate to fill it in)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const svc = serviceClient();
  const { data: chars, error } = await svc
    .from("ai_characters")
    .select("id, name, sprite, base_persona, base_backstory, default_activity_weight, max_concurrent_rooms, created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute "active rooms" load per character (non-ghost member rows
  // whose ai_character_id matches).
  const { data: load } = await svc
    .from("members")
    .select("ai_character_id")
    .not("ai_character_id", "is", null)
    .neq("status", "ghost");
  const counts = new Map<string, number>();
  for (const r of load ?? []) {
    if (!r.ai_character_id) continue;
    counts.set(r.ai_character_id, (counts.get(r.ai_character_id) ?? 0) + 1);
  }

  return NextResponse.json({
    characters: (chars ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      sprite: c.sprite,
      affinity: (c.base_persona as { affinity?: string[] })?.affinity ?? [],
      speech_style: (c.base_persona as { speech_style?: string })?.speech_style ?? null,
      backstory: c.base_backstory,
      default_activity_weight: c.default_activity_weight,
      max_concurrent_rooms: c.max_concurrent_rooms,
      active_rooms: counts.get(c.id) ?? 0,
      created_at: c.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  let body: {
    name?: string;
    affinity?: string[];
    speech_style?: string;
    backstory?: string;
    default_activity_weight?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const name = (body.name ?? "").trim();
  if (!name || name.length > 32) {
    return NextResponse.json({ error: "name required (≤32 chars)" }, { status: 400 });
  }
  const affinity = Array.isArray(body.affinity)
    ? body.affinity.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
    : [];
  const weight = clamp(body.default_activity_weight ?? 0.5, 0.0, 1.0);

  const svc = serviceClient();
  // Placeholder sprite — admin clicks "스프라이트 재생성" to fill in.
  const PLACEHOLDER = "/sprites/hero/test_01.png";

  const { data, error } = await svc
    .from("ai_characters")
    .insert({
      name,
      sprite: PLACEHOLDER,
      base_persona: {
        affinity,
        speech_style: (body.speech_style ?? "").trim() || null,
      },
      base_backstory: (body.backstory ?? "").trim() || null,
      default_activity_weight: weight,
    })
    .select("id, name")
    .single();
  if (error) {
    const code = /duplicate/i.test(error.message) ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status: code });
  }
  return NextResponse.json({ ok: true, id: data.id, name: data.name });
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
