import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";
import { catalogAll } from "@/lib/object-catalog";
import { uploadObjectSprite, insertObjectType } from "@/lib/dynamic-object-gen";

// GET /api/admin/objects — return every object type with variants

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Category = "prop" | "landmark" | "building" | "sky" | "pet";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const types = await catalogAll(serviceClient());
  return NextResponse.json({ types });
}

// POST /api/admin/objects — commit a curated object.
// Body: { label, topics[], nativeHeightPct, category, genDescription?, isExemplar?, dataUrl }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const b = (await req.json().catch(() => ({}))) as {
    label?: string; topics?: string[]; nativeHeightPct?: number; category?: Category;
    genDescription?: string; isExemplar?: boolean; dataUrl?: string;
  };
  if (!b.dataUrl || !b.dataUrl.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "dataUrl(png) required" }, { status: 400 });
  }
  const label = (b.label ?? "").trim() || "오브제";
  const category = (b.category ?? "landmark") as Category;
  const topics = (b.topics ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12);
  const nativeHeightPct = Number.isFinite(b.nativeHeightPct) ? Number(b.nativeHeightPct) : 24;

  const png = Buffer.from(b.dataUrl.split(",")[1], "base64");
  const svc = serviceClient();
  const spriteUrl = await uploadObjectSprite(svc, png, "curated");
  if (!spriteUrl) return NextResponse.json({ error: "upload failed" }, { status: 502 });

  // Curated keys never collide: random suffix. desc_key null (NULLs distinct in
  // the unique(origin_topic, origin_desc_key) index → no dedup conflict).
  const typeKey = `cur_${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 16)}`;
  const created = await insertObjectType(svc, {
    typeKey,
    labelKo: label,
    nativeHeightPct,
    topics,
    category,
    genDescription: (b.genDescription ?? "").trim() || null,
    isExemplar: !!b.isExemplar,
    originTopic: topics[0] ?? null,
    originDescKey: null,
    spriteUrl,
  });
  if (!created) return NextResponse.json({ error: "insert failed" }, { status: 500 });
  return NextResponse.json({ ok: true, type: created });
}

// DELETE /api/admin/objects?id=<typeId> — remove a curated/dynamic type.
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const svc = serviceClient();
  // Guard: never delete a static base type.
  const { data: row } = await svc.from("object_types").select("origin").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ((row as { origin: string }).origin === "static") {
    return NextResponse.json({ error: "static types are protected" }, { status: 403 });
  }
  const { error } = await svc.from("object_types").delete().eq("id", id); // cascades variants
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
