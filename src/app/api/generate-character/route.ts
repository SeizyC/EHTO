import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildPrompt,
  GENDERS,
  SKINS,
  OUTFITS,
  HAIR_STYLES,
  HAIR_COLORS,
  ACCESSORIES,
  type CharacterChoice,
} from "@/lib/prompts";
import { serviceClient, userClient, publicSpriteUrl } from "@/lib/supabase";
import { ensureWorld, seedMembersIfEmpty } from "@/lib/world-seed";
import { IMAGES_GENERATIONS_URL } from "@/lib/openai-urls";
import { isLocale } from "@/lib/language";
import { spendEhto, grantEhto, priceOf } from "@/lib/ehto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-image-1";
const SIZE = "1024x1024";
const QUALITY = "high";
// We rely on gpt-image-1's native transparent-background mode (added 2024).
// This replaces the prior "green chroma + Python PIL" pipeline that couldn't
// run on serverless hosts.
const BACKGROUND = "transparent";

const validGender    = new Set<string>(GENDERS.map((g) => g.id));
const validSkin      = new Set<string>(SKINS.map((s) => s.id));
const validOutfit    = new Set<string>(OUTFITS.map((o) => o.id));
const validHairStyle = new Set<string>(HAIR_STYLES.map((h) => h.id));
const validHairColor = new Set<string>(HAIR_COLORS.map((c) => c.id));
const validAccessory = new Set<string>(ACCESSORIES.map((a) => a.id));

// gpt-image-1 high typically returns in 30–45s but the tail can stretch
// to 60–80s under server load. Single attempt with 90s timeout captures
// almost all cases; if it still hangs, retries don't help (the underlying
// job is the slow part) so we surface a clear error and let the user
// click again rather than doubling the wait.
const ATTEMPT_TIMEOUT_MS = 90_000;

function isPolicyRejection(msg: string): boolean {
  return /safety system|content policy|moderation|policy|rejected/i.test(msg);
}

async function callOpenAI(prompt: string, apiKey: string): Promise<Buffer> {
  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(IMAGES_GENERATIONS_URL, {
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
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : "fetch failed";
    console.warn(`[generate-character] network err after ${Date.now() - t0}ms: ${msg}`);
    throw new Error(/timeout|abort/i.test(msg)
      ? `OpenAI timed out after ${ATTEMPT_TIMEOUT_MS / 1000}s — 잠시 후 다시 시도해주세요`
      : `OpenAI network error: ${msg}`);
  }
  let json: { data?: Array<{ b64_json?: string }>; error?: { message?: string } } | null = null;
  try { json = await resp.json(); } catch { /* non-json */ }
  if (resp.ok && json?.data?.[0]?.b64_json) {
    return Buffer.from(json.data[0].b64_json, "base64");
  }
  const errMsg = json?.error?.message ?? `HTTP ${resp.status} ${resp.statusText}`;
  console.warn(`[generate-character] OpenAI err (${Date.now() - t0}ms): ${errMsg}`);
  if (isPolicyRejection(errMsg)) {
    throw new Error(`OpenAI 콘텐츠 정책에 의해 거부: ${errMsg}`);
  }
  throw new Error(`OpenAI generation failed: ${errMsg}`);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });

  // 1. Authn — Authorization: Bearer <user-jwt>
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

  const userSb = userClient(token);
  const { data: userData, error: userErr } = await userSb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const userId = userData.user.id;

  // 2. Validate body
  let body: Partial<CharacterChoice> & { language?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { gender, skin, outfit, hairStyle, hairColor, accessory } = body;
  // Optional plaza language chosen at creation. Only honored on first-time
  // world creation (ensureWorld is idempotent); invalid/absent → undefined,
  // letting the worlds.language column default ('ko') stand.
  const rawLang = typeof body.language === "string" ? body.language : undefined;
  const language = isLocale(rawLang) ? rawLang : undefined;
  if (
    !gender || !skin || !outfit || !hairStyle || !hairColor || !accessory ||
    !validGender.has(gender) || !validSkin.has(skin) || !validOutfit.has(outfit) ||
    !validHairStyle.has(hairStyle) || !validHairColor.has(hairColor) ||
    !validAccessory.has(accessory)
  ) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }

  const { prompt, rolled } = buildPrompt({
    gender, skin, outfit, hairStyle, hairColor, accessory,
  });

  // 3. Charge EHTO if user already has an active character (this is a change,
  //    not a first creation). Service client is needed here; create it once and
  //    reuse for storage + world-seed below.
  const svc = serviceClient();

  const { data: existingChar } = await svc
    .from("characters")
    .select("id")
    .eq("owner_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  let didCharge = false;
  if (existingChar) {
    // This is a character CHANGE → charge 5 EHTO before generating.
    const newBalance = await spendEhto(svc, userId, priceOf("character_change")!);
    if (newBalance === null) {
      return NextResponse.json({ error: "EHTO가 부족해요" }, { status: 402 });
    }
    didCharge = true;
  }

  // Helper: refund if we charged and something goes wrong after this point.
  async function refundIfCharged() {
    if (didCharge) {
      await grantEhto(svc, userId, priceOf("character_change")!).catch(() => {});
    }
  }

  // 4. Generate (gpt-image-1 returns PNG with transparent background
  // natively — no chroma-key post-processing needed).
  let processed: Buffer;
  try {
    processed = await callOpenAI(prompt, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gen failed";
    console.error(`[generate-character] generation failed:`, msg);
    await refundIfCharged();
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 5. Upload to Storage (service role bypasses RLS — owner_id verified by JWT above)
  const characterId = randomUUID();
  const storagePath = `${userId}/${characterId}.png`;
  const { error: upErr } = await svc.storage.from("characters").upload(storagePath, processed, {
    contentType: "image/png",
    upsert: true,
  });
  if (upErr) {
    await refundIfCharged();
    return NextResponse.json({ error: `upload: ${upErr.message}` }, { status: 502 });
  }

  // 6. Insert row in characters table (as the user, RLS enforced)
  const { data: row, error: insErr } = await userSb
    .from("characters")
    .insert({
      id: characterId,
      owner_id: userId,
      image_path: storagePath,
      gender, skin, outfit,
      rolled_hair: rolled.hair,
      prompt,
      is_active: true,
    })
    .select()
    .single();

  if (insErr) {
    // best-effort cleanup of orphan object
    await svc.storage.from("characters").remove([storagePath]).catch(() => {});
    await refundIfCharged();
    return NextResponse.json({ error: `insert: ${insErr.message}` }, { status: 502 });
  }

  // Ensure world + member roster exist (idempotent — only seeds first time).
  try {
    const worldId = await ensureWorld(svc, userId, undefined, language);
    await seedMembersIfEmpty(svc, worldId);
  } catch (e) {
    // Don't fail character creation if world seed has trouble — just log.
    console.warn("world seed failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    character: row,
    publicUrl: publicSpriteUrl(storagePath),
    rolled,
  });
}
