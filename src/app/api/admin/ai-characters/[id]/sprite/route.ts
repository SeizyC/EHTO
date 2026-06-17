import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient, publicSpriteUrl } from "@/lib/supabase";
import { buildAiSpritePrompt } from "@/lib/ai-sprite-prompt";
import { IMAGES_GENERATIONS_URL } from "@/lib/openai-urls";

// POST /api/admin/ai-characters/[id]/sprite
//
// Generates a fresh persona-tailored sprite for one ai_character via
// gpt-image-1 (transparent-background mode — no chroma post-processing),
// uploads to the `characters` storage bucket under `ai/{id}/{uuid}.png`,
// and updates ai_characters.sprite + propagates the URL to all linked
// `members` rows so plaza renders pick up the fresh sprite.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MODEL = "gpt-image-1";
const SIZE = "1024x1024";
const QUALITY = "high";
const BACKGROUND = "transparent";
const ATTEMPT_TIMEOUT_MS = 90_000;

async function callOpenAI(prompt: string, apiKey: string): Promise<Buffer> {
  const resp = await fetch(IMAGES_GENERATIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      size: SIZE,
      quality: QUALITY,
      background: BACKGROUND,
    }),
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });
  const j = await resp.json().catch(() => null);
  if (resp.ok && j?.data?.[0]?.b64_json) {
    return Buffer.from(j.data[0].b64_json, "base64");
  }
  throw new Error(j?.error?.message ?? `HTTP ${resp.status} ${resp.statusText}`);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });

  const { id } = await params;
  const svc = serviceClient();

  const { data: ch } = await svc
    .from("ai_characters")
    .select("id, name, base_persona, base_backstory")
    .eq("id", id)
    .maybeSingle();
  if (!ch) return NextResponse.json({ error: "not found" }, { status: 404 });

  const persona = (ch.base_persona as { affinity?: string[]; speech_style?: string }) ?? {};
  const prompt = buildAiSpritePrompt({
    name: ch.name,
    affinity: persona.affinity ?? [],
    speech_style: persona.speech_style ?? null,
    backstory: ch.base_backstory,
  });

  let processed: Buffer;
  try {
    processed = await callOpenAI(prompt, apiKey);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gen failed" },
      { status: 502 },
    );
  }

  // Versioned filename so the previous sprite's CDN cache doesn't shadow
  // the new one for users already viewing the plaza.
  const filename = `ai/${id}/${randomUUID()}.png`;
  const { error: upErr } = await svc.storage
    .from("characters")
    .upload(filename, processed, { contentType: "image/png", upsert: false });
  if (upErr) {
    return NextResponse.json({ error: `upload: ${upErr.message}` }, { status: 502 });
  }

  const url = publicSpriteUrl(filename);
  const { error: updErr } = await svc
    .from("ai_characters")
    .update({ sprite: url })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: `db update: ${updErr.message}` }, { status: 500 });
  }

  // Propagate the new sprite to every existing `members` row seeded
  // from this ai_character. Without this step the global pool gets the
  // fresh sprite but the plazas still render the *old copy* baked into
  // each member's persona JSON — which is what caused "admin regenerated
  // but plaza still shows duplicates". Member count per character is
  // typically 1–5 so the N+1 update pattern is fine.
  const { data: linked } = await svc
    .from("members")
    .select("id, persona")
    .eq("ai_character_id", id);
  let synced = 0;
  for (const m of linked ?? []) {
    const newPersona = { ...(m.persona as object), sprite: url };
    const { error: mErr } = await svc
      .from("members")
      .update({ persona: newPersona })
      .eq("id", m.id);
    if (!mErr) synced++;
  }

  return NextResponse.json({ ok: true, sprite: url, synced });
}
