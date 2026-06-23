// Dynamic object generation pipeline.
//
// implicit 토픽 → 광장 가구. plaza-grow가 milestone에서 호출하면:
//   1. Haiku로 영어 description + 한글 label 작성 (1 call, JSON)
//   2. desc_key = sha256(normalized desc) — 전역 dedup 키
//   3. (origin_topic, desc_key) 카탈로그 룩업 — 있으면 그 type 재사용
//   4. 없으면 gpt-image-1(transparent)로 스프라이트 생성 → characters 버킷 업로드
//   5. object_types + object_variants(idx=1) INSERT → 카탈로그 캐시 무효화
//
// 어느 단계든 실패하면 null → plaza-grow가 정적 alternate로 폴백. OPENAI_API_KEY
// 가 없거나 DYNAMIC_OBJECTS_DISABLED=1 이면 즉시 null (안전 가드/킬스위치).
//
// 스프라이트는 캐릭터 파이프라인과 동일하게 gpt-image-1 transparent 모드를 쓰므로
// chroma 후처리가 필요 없다 (옛 gen-object.sh의 chroma-green 단계 불요).
//
// Spec: docs/superpowers/specs/2026-05-31-dynamic-object-generation-design.md

import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateCatalog, type ObjectType } from "@/lib/object-catalog";
import { publicSpriteUrl } from "@/lib/supabase";
import { chatComplete } from "@/lib/claude";
import { IMAGES_GENERATIONS_URL } from "@/lib/openai-urls";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type Category = "prop" | "landmark" | "building" | "sky" | "pet";

const CATEGORY_CUE: Record<Category, string> = {
  prop: "a small piece of street furniture or a small object (knee-to-waist height), sits on the ground",
  landmark: "a medium-to-large plaza installation (a person-and-a-half tall), a clear focal piece, sits on the ground",
  building: "a small storefront-style building seen front-on, ground floor readable, sits on the ground",
  sky: "a small aerial object seen from the side, floating, no ground",
  pet: "a small friendly animal, sits or stands on the ground",
};

const IMG_MODEL = "gpt-image-1";
const IMG_SIZE = "1024x1024";
const IMG_TIMEOUT_MS = 90_000;
const VARIANT_CAP = 5;
const STORAGE_BUCKET = "characters"; // public bucket; objects live under objects/dynamic/
const SPRITE_RETRIES = 2;

export type DynamicGenArgs = {
  topic: string;
  slotHeightPct: number;
  slotTopics: string[];
  category?: Category;
};

/** OpenAI key when generation is allowed; null disables the whole pipeline
 *  (missing key, or DYNAMIC_OBJECTS_DISABLED kill switch). */
function genKey(): string | null {
  if (process.env.DYNAMIC_OBJECTS_DISABLED === "1") return null;
  return process.env.OPENAI_API_KEY || null;
}

/** Raw OpenAI key, ignoring the runtime kill switch. The admin curation flow
 *  is an explicit, reviewed action so it stays available even when automatic
 *  runtime generation is paused via DYNAMIC_OBJECTS_DISABLED. */
export function imageGenKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

type TypeRow = {
  id: string;
  type_key: string;
  label_ko: string;
  native_height_pct: number;
  topics: string[] | null;
  category?: string | null;
  origin: "static" | "dynamic";
  origin_topic: string | null;
  origin_desc_key: string | null;
  usage_count: number | null;
  object_variants?: Array<{ id: string; variant_idx: number; sprite_url: string }>;
};

const TYPE_SELECT =
  "id, type_key, label_ko, native_height_pct, topics, category, origin, origin_topic, origin_desc_key, usage_count, object_variants(id, variant_idx, sprite_url)";

function rowToType(r: TypeRow): ObjectType {
  const variants = (r.object_variants ?? [])
    .map((v) => ({ id: v.id, variantIdx: v.variant_idx, spriteUrl: v.sprite_url }))
    .sort((a, b) => a.variantIdx - b.variantIdx);
  return {
    id: r.id,
    typeKey: r.type_key,
    labelKo: r.label_ko,
    nativeHeightPct: r.native_height_pct,
    topics: r.topics ?? [],
    category: (r.category ?? "prop") as ObjectType["category"],
    origin: r.origin,
    originTopic: r.origin_topic,
    originDescKey: r.origin_desc_key,
    usageCount: r.usage_count ?? 0,
    variants,
  };
}

function descKeyOf(description: string): string {
  const normalized = description.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/** Haiku: one concrete object's English visual description + a short Korean
 *  label, as compact JSON. A single, specific object — never a category. */
export async function composeObject(
  topic: string,
  slotTopics: string[],
  opts: { category?: Category; exemplars?: string[]; variationHint?: string } = {},
): Promise<{ desc: string; label: string } | null> {
  const cat = opts.category ?? "landmark";
  const exampleBlock =
    opts.exemplars && opts.exemplars.length
      ? `\n참고용 톤 예시 (스타일만 맞추고 베끼지 말 것):\n- ${opts.exemplars.slice(0, 4).join("\n- ")}`
      : "";
  const system = [
    `당신은 작은 도시 광장에 놓을 단일 ${cat} 오브제의 시각 description을 작성합니다.`,
    "반드시 아래 JSON 한 줄만 출력하세요. 다른 텍스트 금지:",
    '{"desc":"<english>","label":"<korean>"}',
    "규칙:",
    `- desc: 영어 10-20단어. 구체적인 단일 사물 1개. (${CATEGORY_CUE[cat]})`,
    "- 분위기: contemporary urban small plaza prop, not fantasy, not a person.",
    "- label: 그 사물의 짧은 한글 이름 (2-6자).",
    opts.variationHint ? `- 변형 지시: ${opts.variationHint}` : "",
    exampleBlock,
  ]
    .filter(Boolean)
    .join("\n");
  const user = `토픽: ${topic}\n슬롯 톤(참고): ${slotTopics.join(", ") || "—"}\n이 토픽 결을 가진 광장 ${cat} 하나.`;

  const out = await chatComplete({ system, user, maxTokens: 220, model: HAIKU_MODEL });
  if (!out) return null;
  const m = out.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { desc?: unknown; label?: unknown };
      const desc = typeof j.desc === "string" ? j.desc.trim() : "";
      const label = typeof j.label === "string" && j.label.trim() ? j.label.trim() : topic;
      if (desc) return { desc: desc.slice(0, 300), label: label.slice(0, 24) };
    } catch {
      /* fall through */
    }
  }
  const desc = out.replace(/\s+/g, " ").trim();
  return desc ? { desc: desc.slice(0, 300), label: topic.slice(0, 24) } : null;
}

function buildObjectPrompt(description: string, category: Category = "landmark"): string {
  const groundLine =
    category === "sky"
      ? "transparent background, floating, no ground, no shadow, no scenery — the object only,"
      : "the object fills most of the frame and rests on the bottom edge, minimal empty margin, transparent background, no ground, no floor, no shadow, no scenery — the object only,";
  return [
    `A single isolated ${description},`,
    `${CATEGORY_CUE[category]},`,
    "isometric pixel art, 3/4 perspective view from above-front,",
    "painterly soft pixel art style matching Stardew Valley town and Habbo plaza aesthetic,",
    "soft 1px outline edges, chunky readable proportions,",
    "one single object, the entire object fully in frame and not cropped,",
    groundLine,
    "a contemporary urban small-plaza prop, not fantasy.",
  ].join(" ");
}

/** gpt-image-1 transparent-mode generation → PNG buffer (or null). */
async function genSpritePng(prompt: string, apiKey: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(IMAGES_GENERATIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMG_MODEL,
        prompt,
        n: 1,
        size: IMG_SIZE,
        quality: "high",
        background: "transparent",
      }),
      signal: AbortSignal.timeout(IMG_TIMEOUT_MS),
    });
    const j = await resp.json().catch(() => null);
    if (resp.ok && j?.data?.[0]?.b64_json) return Buffer.from(j.data[0].b64_json, "base64");
    console.warn("[dyn-obj] image gen failed:", j?.error?.message ?? `HTTP ${resp.status}`);
    return null;
  } catch (e) {
    console.warn("[dyn-obj] image gen error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Generate an object sprite PNG from a description (transparent, retried).
 *  Returns the raw bytes — no upload — so the admin preview flow can show it
 *  before committing anything. */
export async function generateObjectSpriteBytes(
  description: string,
  apiKey: string,
  category: Category = "landmark",
): Promise<Buffer | null> {
  const prompt = buildObjectPrompt(description, category);
  for (let attempt = 0; attempt < SPRITE_RETRIES; attempt++) {
    const png = await genSpritePng(prompt, apiKey);
    if (png) return png;
  }
  return null;
}

/** Upload a sprite PNG to public storage; returns its public URL (or null). */
export async function uploadObjectSprite(
  sb: SupabaseClient,
  png: Buffer,
  sub: "dynamic" | "curated" = "dynamic",
): Promise<string | null> {
  const path = `objects/${sub}/${randomUUID()}.png`;
  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, png, { contentType: "image/png", upsert: false });
  if (error) {
    console.warn("[dyn-obj] upload failed:", error.message);
    return null;
  }
  return publicSpriteUrl(path);
}

/** Generate a sprite from a description and upload it; returns the public URL. */
async function generateAndUploadSprite(
  sb: SupabaseClient,
  description: string,
  apiKey: string,
  category: Category = "landmark",
): Promise<string | null> {
  const png = await generateObjectSpriteBytes(description, apiKey, category);
  if (!png) return null;
  return uploadObjectSprite(sb, png, "dynamic");
}

/** INSERT an object_type + its first variant, then invalidate the catalog
 *  cache. Shared by runtime generation and admin curation. Returns the new
 *  ObjectType, or null on failure (caller decides how to handle a unique-key
 *  race). */
export async function insertObjectType(
  sb: SupabaseClient,
  params: {
    typeKey: string;
    labelKo: string;
    nativeHeightPct: number;
    topics: string[];
    category: Category;
    genDescription: string | null;
    isExemplar?: boolean;
    originTopic: string | null;
    originDescKey: string | null;
    spriteUrl: string;
  },
): Promise<ObjectType | null> {
  const { data: typeRow, error: typeErr } = await sb
    .from("object_types")
    .insert({
      type_key: params.typeKey,
      label_ko: params.labelKo,
      native_height_pct: params.nativeHeightPct,
      topics: params.topics,
      category: params.category,
      gen_description: params.genDescription,
      is_exemplar: params.isExemplar ?? false,
      origin: "dynamic",
      origin_topic: params.originTopic,
      origin_desc_key: params.originDescKey,
    })
    .select("id")
    .single();
  if (typeErr || !typeRow) {
    console.warn("[dyn-obj] type insert failed:", typeErr?.message);
    return null;
  }

  const typeId = (typeRow as { id: string }).id;
  const { data: varRow, error: varErr } = await sb
    .from("object_variants")
    .insert({ type_id: typeId, variant_idx: 1, sprite_url: params.spriteUrl })
    .select("id, variant_idx, sprite_url")
    .single();
  if (varErr || !varRow) {
    console.warn("[dyn-obj] variant insert failed:", varErr?.message);
    return null;
  }

  invalidateCatalog();
  const v = varRow as { id: string; variant_idx: number; sprite_url: string };
  return {
    id: typeId,
    typeKey: params.typeKey,
    labelKo: params.labelKo,
    nativeHeightPct: params.nativeHeightPct,
    topics: params.topics,
    category: params.category,
    origin: "dynamic",
    originTopic: params.originTopic,
    originDescKey: params.originDescKey,
    usageCount: 0,
    variants: [{ id: v.id, variantIdx: v.variant_idx, spriteUrl: v.sprite_url }],
  };
}

async function fetchTypeByOriginKey(
  sb: SupabaseClient,
  topic: string,
  descKey: string,
): Promise<ObjectType | null> {
  const { data, error } = await sb
    .from("object_types")
    .select(TYPE_SELECT)
    .eq("origin_topic", topic)
    .eq("origin_desc_key", descKey)
    .maybeSingle();
  if (error || !data) return null;
  return rowToType(data as TypeRow);
}

/** Approved (is_exemplar) gen descriptions for a category — the few-shot guide. */
export async function fetchExemplars(
  sb: SupabaseClient,
  category: Category,
  limit = 4,
): Promise<string[]> {
  const { data } = await sb
    .from("object_types")
    .select("gen_description")
    .eq("category", category)
    .eq("is_exemplar", true)
    .not("gen_description", "is", null)
    .limit(limit);
  return (data ?? [])
    .map((r) => (r as { gen_description: string | null }).gen_description)
    .filter((d): d is string => !!d);
}

export async function tryGenerateDynamicType(
  sb: SupabaseClient,
  args: DynamicGenArgs,
): Promise<ObjectType | null> {
  const apiKey = genKey();
  if (!apiKey) return null;

  const category: Category = args.category ?? "landmark";

  // 1. Description + label (Haiku), with category cue + few-shot exemplars.
  const exemplars = await fetchExemplars(sb, category);
  const composed = await composeObject(args.topic, args.slotTopics, { category, exemplars });
  if (!composed) return null;
  const descKey = descKeyOf(composed.desc);

  // 2. Global dedup — another world may have already grown this exact result.
  const existing = await fetchTypeByOriginKey(sb, args.topic, descKey);
  if (existing && existing.variants.length > 0) return existing;

  // 3. Sprite (retried internally).
  const spriteUrl = await generateAndUploadSprite(sb, composed.desc, apiKey, category);
  if (!spriteUrl) return null;

  // 4. INSERT type + first variant (handles race via unique constraint).
  const typeKey = `dyn_${descKey}`;
  const inserted = await insertObjectType(sb, {
    typeKey,
    labelKo: composed.label,
    nativeHeightPct: args.slotHeightPct,
    topics: [args.topic, ...args.slotTopics],
    category,
    genDescription: composed.desc,
    originTopic: args.topic,
    originDescKey: descKey,
    spriteUrl,
  });

  if (!inserted) {
    // unique(origin_topic, origin_desc_key) — a concurrent world won the race.
    // Reuse theirs (our uploaded sprite becomes a harmless orphan).
    const raced = await fetchTypeByOriginKey(sb, args.topic, descKey);
    if (raced && raced.variants.length > 0) return raced;
    console.warn("[dyn-obj] type insert failed (race)");
    return null;
  }

  return inserted;
}

/** Variant lazy generation — fire-and-forget after a placement when a type
 *  gets popular (usage_count/variants > 5, capped at VARIANT_CAP). Produces a
 *  topic-aligned alternate look so 1000 worlds don't all show the identical
 *  sprite. Best-effort: any failure is a silent no-op (next placement retries). */
export async function tryGenerateVariant(sb: SupabaseClient, typeId: string): Promise<boolean> {
  const apiKey = genKey();
  if (!apiKey) return false;

  const { data, error } = await sb.from("object_types").select(TYPE_SELECT).eq("id", typeId).maybeSingle();
  if (error || !data) return false;
  const type = rowToType(data as TypeRow);

  const nextIdx = type.variants.reduce((mx, v) => Math.max(mx, v.variantIdx), 0) + 1;
  if (nextIdx > VARIANT_CAP) return false;

  // We don't persist the original English description, so regenerate from the
  // topic with an explicit "make it clearly different" hint for visual variety.
  const topic = type.originTopic ?? type.topics[0] ?? type.labelKo;
  const composed = await composeObject(topic, type.topics, { category: type.category, variationHint: "원본과 색/재질/실루엣이 뚜렷이 다른 같은 종류의 변형." });
  if (!composed) return false;

  const spriteUrl = await generateAndUploadSprite(sb, composed.desc, apiKey, type.category);
  if (!spriteUrl) return false;

  const { error: insErr } = await sb
    .from("object_variants")
    .insert({ type_id: typeId, variant_idx: nextIdx, sprite_url: spriteUrl });
  if (insErr) {
    // unique(type_id, variant_idx) race → another tick already added this idx.
    console.warn("[dyn-obj] variant insert skipped:", insErr.message);
    return false;
  }
  invalidateCatalog();
  return true;
}

// Test-only surface (pure functions; no network).
export const descKeyForTest = descKeyOf;
export function buildObjectPromptForTest(d: string, c: Category) { return buildObjectPrompt(d, c); }
