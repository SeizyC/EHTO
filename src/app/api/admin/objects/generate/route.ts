import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";
import {
  composeObject,
  generateObjectSpriteBytes,
  fetchExemplars,
  imageGenKey,
} from "@/lib/dynamic-object-gen";

// POST /api/admin/objects/generate
// Body: { category, topic?, description? }
// Generates ONE sprite (no commit) and returns it as a data URL for preview.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Category = "prop" | "landmark" | "building" | "sky" | "pet";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const apiKey = imageGenKey();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as {
    category?: Category; topic?: string; description?: string;
  };
  const category = (body.category ?? "landmark") as Category;

  let desc = (body.description ?? "").trim();
  let label = (body.topic ?? "").trim();
  if (!desc) {
    const topic = (body.topic ?? "").trim();
    if (!topic) return NextResponse.json({ error: "topic or description required" }, { status: 400 });
    const sb = serviceClient();
    const exemplars = await fetchExemplars(sb, category);
    const composed = await composeObject(topic, [], { category, exemplars });
    if (!composed) return NextResponse.json({ error: "compose failed" }, { status: 502 });
    desc = composed.desc;
    label = composed.label;
  }

  const png = await generateObjectSpriteBytes(desc, apiKey, category);
  if (!png) return NextResponse.json({ error: "image gen failed" }, { status: 502 });

  return NextResponse.json({
    desc,
    label: label || "오브제",
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
  });
}
