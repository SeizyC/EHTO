# Object Curation & Topic Exposure (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Categorize the object catalog (prop/landmark/building/sky/pet), let admins pre-generate & curate objects with topics, and have plaza-grow expose curated objects by topic match — with a per-tier few-shot "style guide" feeding future generation. No renderer/canvas changes (that is Phase 2).

**Architecture:** Extend the existing DB catalog (`object_types`/`object_variants`) with `category` + `gen_description` + `is_exemplar`. Reuse the already-implemented `dynamic-object-gen` pipeline, making prompts category-aware and injecting approved exemplar descriptions. Add admin generate-preview + create endpoints and an "오브제 추가" modal. Generalize `plaza-grow`'s milestone selection to pick curated catalog objects (filtered by the slot's category + size, scored by implicit topic overlap) before falling back to runtime generation. Building tier is defined in the schema but NOT placed yet (needs Phase-2 rendering) — Phase 1 exposes `prop`/`landmark` only.

**Tech Stack:** Next.js 14 (App Router, nodejs runtime on OpenNext/Cloudflare), Supabase (Postgres + Storage), Anthropic Claude (Haiku for descriptions), OpenAI gpt-image-1 (sprites, transparent mode), framer-motion (existing UI). Tests: `tsx` + `node:assert/strict` scripts (matches `scripts/test-energy.ts`), `npm run typecheck`, `npm run lint`.

**Authorization gates (flagged inline):** Three steps touch shared infra and require explicit user approval at execution time: (a) applying the migration to the shared Supabase DB, (b) any live sprite generation (OpenAI cost + DB/storage writes), (c) `wrangler deploy`. The plan marks these `🔐 NEEDS USER AUTH`.

---

## File Structure

- `supabase/migrations/20260623000001_object_category.sql` — **Create**: add `category`/`gen_description`/`is_exemplar` to `object_types`, index, backfill the 9 static types.
- `src/lib/plaza-objects.ts` — **Modify**: add `category` to `CatalogEntry` + values for the 9 (code-side source of truth, kept in sync with the SQL backfill).
- `src/lib/object-catalog.ts` — **Modify**: add `category` to `ObjectType`, select + map it.
- `src/lib/dynamic-object-gen.ts` — **Modify**: category-aware `composeObject`/`buildObjectPrompt`, store `gen_description`, exemplar few-shot, `insertObjectType` accepts `category`/`gen_description`/`is_exemplar`; add `selectCuratedForSlot` pure helper + `fetchExemplars`.
- `src/app/api/admin/objects/generate/route.ts` — **Create**: POST preview generation (returns b64 + desc/label, no commit).
- `src/app/api/admin/objects/route.ts` — **Modify**: add POST (create from b64 + meta) and DELETE (remove a curated type).
- `src/app/(app)/admin/objects/page.tsx` — **Modify**: "오브제 추가" modal (generate/regenerate/edit/upload/save) + per-card delete for dynamic types.
- `src/lib/plaza-grow.ts` — **Modify**: map each milestone to a `category`, generalize selection to curated catalog via `selectCuratedForSlot` before the runtime fallback.
- `scripts/test-objgen-units.ts` — **Create**: unit asserts for `descKeyOf`, `buildObjectPrompt` category cues, `selectCuratedForSlot`.
- `scripts/test-dyn-obj.ts` — **Modify**: pass `category` through the controlled integration test.

---

## Task 1: Schema migration — category + guide columns + backfill

**Files:**
- Create: `supabase/migrations/20260623000001_object_category.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Object taxonomy phase 1: categorize the catalog + capture generation guide.
-- See docs/superpowers/specs/2026-06-23-world-object-taxonomy-design.md
--
-- category  : render band + size tier + generation prompt family.
-- gen_description : the English description a sprite was generated from. Kept so
--                   approved objects can seed a per-tier few-shot style guide.
-- is_exemplar     : admin-approved "use this as a guide example" flag.

alter table public.object_types
  add column if not exists category text not null default 'prop'
    check (category in ('prop','landmark','building','sky','pet')),
  add column if not exists gen_description text,
  add column if not exists is_exemplar boolean not null default false;

create index if not exists object_types_category_idx
  on public.object_types(category);

-- Backfill the 9 bootstrapped static types. Idempotent (only sets rows still
-- on the 'prop' default for their known key).
update public.object_types set category = 'landmark'
  where type_key in ('fountain','lamp','tree');
update public.object_types set category = 'pet'
  where type_key in ('dog_shiba','dog_maltese','dog_retriever','dog_dachshund');
-- bench, planter stay 'prop' (the default).
```

- [ ] **Step 2: Verify the SQL parses locally (no apply)**

Run: `grep -c "add column if not exists" supabase/migrations/20260623000001_object_category.sql`
Expected: `3`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260623000001_object_category.sql
git commit -m "feat(db): object_types category + gen_description + is_exemplar"
```

- [ ] **Step 4: 🔐 NEEDS USER AUTH — apply to shared Supabase**

Ask the user to authorize applying the migration (shared prod DB write). The project applies migrations via the Supabase SQL editor or CLI; confirm the user's preferred method. After apply, verify:
Run (after auth): a `select category, count(*) from object_types group by category;` via the user's chosen tool.
Expected: `landmark=3, pet=4, prop=2` (the 9 bootstrapped types).

---

## Task 2: Category in the code-side catalog constant

**Files:**
- Modify: `src/lib/plaza-objects.ts` (the `CatalogEntry` type + `OBJECT_CATALOG` values)

- [ ] **Step 1: Add `category` to the `CatalogEntry` type**

In `src/lib/plaza-objects.ts`, find the `type CatalogEntry = { ... }` block and add the field:

```ts
type CatalogEntry = {
  src: string;
  nativeHeightPct: number;
  label: string;
  topics?: string[];
  /** Render band + size tier + generation prompt family. Mirrors the
   *  object_types.category column (see 20260623000001 migration). */
  category: "prop" | "landmark" | "building" | "sky" | "pet";
};
```

- [ ] **Step 2: Set `category` on each of the 9 entries**

Edit each `OBJECT_CATALOG` entry to add `category` matching the migration backfill:

```ts
  fountain: { src: "/sprites/rooms/objects/fountain.png", nativeHeightPct: 24,  label: "분수대", topics: ["중앙", "공공", "클래식"], category: "landmark" },
  bench:    { src: "/sprites/rooms/objects/bench.png",    nativeHeightPct: 12,  label: "벤치",   topics: ["휴식", "독서", "대화"], category: "prop" },
  planter:  { src: "/sprites/rooms/objects/planter.png",  nativeHeightPct: 8.5, label: "화분",   topics: ["식물", "소소함"], category: "prop" },
  lamp:     { src: "/sprites/rooms/objects/lamp.png",     nativeHeightPct: 33,  label: "가로등", topics: ["밤", "분위기", "거리"], category: "landmark" },
  tree:     { src: "/sprites/rooms/objects/tree.png",     nativeHeightPct: 44,  label: "나무",   topics: ["자연", "계절", "쉼"], category: "landmark" },
  dog_shiba:     { src: "/sprites/rooms/objects/dog_shiba_sitting.png",      nativeHeightPct: 4.5, label: "시바",     topics: ["반려", "활기", "귀여움"], category: "pet" },
  dog_maltese:   { src: "/sprites/rooms/objects/dog_maltese_wagging.png",    nativeHeightPct: 4.5, label: "말티즈",   topics: ["반려", "귀여움"], category: "pet" },
  dog_retriever: { src: "/sprites/rooms/objects/dog_retriever_sleeping.png", nativeHeightPct: 3,   label: "리트리버", topics: ["반려", "쉼"], category: "pet" },
  dog_dachshund: { src: "/sprites/rooms/objects/dog_dachshund_standing.png", nativeHeightPct: 4.5, label: "닥스훈트", topics: ["반려", "귀여움"], category: "pet" },
```

(Keep any other existing entries; set their `category` by the same height rule: ≤22 → prop, 24–40 → landmark.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If other files build `CatalogEntry` objects without `category`, add it there too.

- [ ] **Step 4: Commit**

```bash
git add src/lib/plaza-objects.ts
git commit -m "feat: category on code-side object catalog"
```

---

## Task 3: Category in the DB-backed catalog accessor

**Files:**
- Modify: `src/lib/object-catalog.ts`

- [ ] **Step 1: Add `category` to the `ObjectType` type**

In `src/lib/object-catalog.ts`, add to the `ObjectType` type:

```ts
export type ObjectType = {
  id: string;
  typeKey: string;
  labelKo: string;
  nativeHeightPct: number;
  topics: string[];
  category: "prop" | "landmark" | "building" | "sky" | "pet";
  origin: "static" | "dynamic";
  originTopic: string | null;
  originDescKey: string | null;
  usageCount: number;
  variants: ObjectVariant[];
};
```

- [ ] **Step 2: Select + map `category` in `loadCatalog`**

In the `.select(...)` string add `category`:

```ts
    .select("id, type_key, label_ko, native_height_pct, topics, category, origin, origin_topic, origin_desc_key, usage_count, object_variants(id, variant_idx, sprite_url)");
```

In the `const type: ObjectType = { ... }` mapping add:

```ts
      category: (r.category ?? "prop") as ObjectType["category"],
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Other constructors of `ObjectType` (e.g. in `dynamic-object-gen.ts`) will now error for missing `category` — that is fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/lib/object-catalog.ts
git commit -m "feat: category in DB-backed object catalog"
```

---

## Task 4: Category-aware generation + guide (gen_description, exemplars)

**Files:**
- Modify: `src/lib/dynamic-object-gen.ts`
- Test: `scripts/test-objgen-units.ts`

- [ ] **Step 1: Add category-aware prompt cues**

In `src/lib/dynamic-object-gen.ts`, add a per-category style map and make `buildObjectPrompt` take a category:

```ts
type Category = "prop" | "landmark" | "building" | "sky" | "pet";

const CATEGORY_CUE: Record<Category, string> = {
  prop: "a small piece of street furniture or a small object (knee-to-waist height), sits on the ground",
  landmark: "a medium-to-large plaza installation (a person-and-a-half tall), a clear focal piece, sits on the ground",
  building: "a small storefront-style building seen front-on, ground floor readable, sits on the ground",
  sky: "a small aerial object seen from the side, floating, no ground",
  pet: "a small friendly animal, sits or stands on the ground",
};

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
```

- [ ] **Step 2: Thread category + exemplars through `composeObject`**

Replace the `composeObject` signature/system prompt to accept a `category` and optional `exemplars`:

```ts
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
    '- label: 그 사물의 짧은 한글 이름 (2-6자).',
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
```

- [ ] **Step 3: Add `fetchExemplars` + extend `insertObjectType`**

Add an exemplar fetch (approved descriptions of the same category) and thread the new columns through `insertObjectType`:

```ts
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
```

In `insertObjectType`, extend the `params` and the inserted row + returned object:

```ts
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
```

- [ ] **Step 4: Use category + exemplars + gen_description in `tryGenerateDynamicType`**

Update `tryGenerateDynamicType` to accept a category in `DynamicGenArgs`, fetch exemplars, pass them in, and store the description. Replace the relevant parts:

```ts
export type DynamicGenArgs = {
  topic: string;
  slotHeightPct: number;
  slotTopics: string[];
  category?: Category; // defaults to "landmark"
};

export async function tryGenerateDynamicType(
  sb: SupabaseClient,
  args: DynamicGenArgs,
): Promise<ObjectType | null> {
  const apiKey = genKey();
  if (!apiKey) return null;
  const category = args.category ?? "landmark";

  const exemplars = await fetchExemplars(sb, category);
  const composed = await composeObject(args.topic, args.slotTopics, { category, exemplars });
  if (!composed) return null;
  const descKey = descKeyOf(composed.desc);

  const existing = await fetchTypeByOriginKey(sb, args.topic, descKey);
  if (existing && existing.variants.length > 0) return existing;

  const png = await generateObjectSpriteBytes(composed.desc, apiKey); // category cue baked via buildObjectPrompt? -> see note
  if (!png) return null;
  const spriteUrl = await uploadObjectSprite(sb, png, "dynamic");
  if (!spriteUrl) return null;

  const created = await insertObjectType(sb, {
    typeKey: `dyn_${descKey}`,
    labelKo: composed.label,
    nativeHeightPct: args.slotHeightPct,
    topics: [args.topic, ...args.slotTopics],
    category,
    genDescription: composed.desc,
    originTopic: args.topic,
    originDescKey: descKey,
    spriteUrl,
  });
  if (created) return created;
  const raced = await fetchTypeByOriginKey(sb, args.topic, descKey);
  return raced && raced.variants.length > 0 ? raced : null;
}
```

NOTE: `generateObjectSpriteBytes(description, apiKey)` currently hardcodes `buildObjectPrompt(description)` with the default category. Update its signature to `generateObjectSpriteBytes(description, apiKey, category: Category = "landmark")` and pass `buildObjectPrompt(description, category)`. Update both call sites (here and the admin generate endpoint in Task 5).

- [ ] **Step 5: Write unit asserts**

Create `scripts/test-objgen-units.ts`:

```ts
import assert from "node:assert/strict";
import { buildObjectPromptForTest, descKeyForTest } from "../src/lib/dynamic-object-gen";

// descKey is stable + case/space-insensitive
assert.equal(descKeyForTest("A Red Lamp"), descKeyForTest("a red   lamp"));
assert.notEqual(descKeyForTest("a red lamp"), descKeyForTest("a blue lamp"));
assert.equal(descKeyForTest("x").length, 16);

// category cues differ + sky has no ground line
const propP = buildObjectPromptForTest("a bench", "prop");
const skyP = buildObjectPromptForTest("a balloon", "sky");
assert.ok(propP.includes("street furniture"));
assert.ok(skyP.includes("floating"));
assert.ok(!skyP.includes("rests on the bottom edge"));

console.log("✅ objgen units pass");
```

For these to import, add two test-only re-exports at the bottom of `dynamic-object-gen.ts`:

```ts
// Test-only surface (pure functions; no network).
export const descKeyForTest = descKeyOf;
export function buildObjectPromptForTest(d: string, c: Category) { return buildObjectPrompt(d, c); }
```

- [ ] **Step 6: Run unit asserts**

Run: `npx tsx scripts/test-objgen-units.ts`
Expected: `✅ objgen units pass`

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add src/lib/dynamic-object-gen.ts scripts/test-objgen-units.ts
git commit -m "feat: category-aware generation + few-shot exemplar guide"
```

---

## Task 5: Admin generate-preview endpoint

**Files:**
- Create: `src/app/api/admin/objects/generate/route.ts`

- [ ] **Step 1: Write the endpoint**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/objects/generate/route.ts
git commit -m "feat(admin): object generate-preview endpoint"
```

---

## Task 6: Admin create + delete endpoints

**Files:**
- Modify: `src/app/api/admin/objects/route.ts`

- [ ] **Step 1: Add POST (create) and DELETE to the existing file**

Append to `src/app/api/admin/objects/route.ts` (keep the existing GET):

```ts
import { randomUUID, createHash } from "node:crypto";
import { uploadObjectSprite, insertObjectType } from "@/lib/dynamic-object-gen";

type Category = "prop" | "landmark" | "building" | "sky" | "pet";

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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/objects/route.ts
git commit -m "feat(admin): create + delete curated objects"
```

---

## Task 7: Admin UI — "오브제 추가" modal + per-card delete

**Files:**
- Modify: `src/app/(app)/admin/objects/page.tsx`

- [ ] **Step 1: Add modal state + button to `AdminObjectsPage`**

At the top of the `AdminObjectsPage` component body add `const [adding, setAdding] = useState(false);`. In the header `<div>` (next to the count) add a button:

```tsx
        <button
          onClick={() => setAdding(true)}
          className="border-line text-sub hover:text-ink rounded-md border px-3 py-1.5 text-[12px] transition"
          aria-label="오브제 추가"
        >＋ 오브제 추가</button>
```

After the grid (before the component's closing `</div>`), render the modal:

```tsx
      {adding && <AddObjectModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
```

- [ ] **Step 2: Implement the `AddObjectModal` component**

Append to `src/app/(app)/admin/objects/page.tsx`:

```tsx
import { AnimatePresence, motion } from "framer-motion";

const CATEGORIES: Array<{ key: "prop" | "landmark" | "building" | "sky" | "pet"; label: string; h: number }> = [
  { key: "prop", label: "소품", h: 14 },
  { key: "landmark", label: "랜드마크", h: 28 },
  { key: "building", label: "건물", h: 56 },
  { key: "sky", label: "하늘/공중", h: 10 },
  { key: "pet", label: "펫", h: 6 },
];

function AddObjectModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["key"]>("landmark");
  const [topic, setTopic] = useState("");
  const [desc, setDesc] = useState("");
  const [label, setLabel] = useState("");
  const [topics, setTopics] = useState("");
  const [height, setHeight] = useState(28);
  const [exemplar, setExemplar] = useState(true);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function authHeader() {
    const sb = browserClient();
    const { data } = await sb.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async function generate() {
    setBusy("gen"); setErr(null);
    try {
      const r = await fetch("/api/admin/objects/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ category, topic: topic || undefined, description: desc || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "생성 실패");
      setDataUrl(j.dataUrl); setDesc(j.desc);
      if (!label) setLabel(j.label);
      if (!topics && topic) setTopics(topic);
    } catch (e) { setErr(e instanceof Error ? e.message : "생성 실패"); }
    finally { setBusy(null); }
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setDataUrl(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function save() {
    if (!dataUrl) { setErr("먼저 생성하거나 업로드하세요"); return; }
    setBusy("save"); setErr(null);
    try {
      const r = await fetch("/api/admin/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          label, category, nativeHeightPct: height,
          topics: topics.split(",").map((s) => s.trim()).filter(Boolean),
          genDescription: desc || null, isExemplar: exemplar, dataUrl,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "저장 실패");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(null); }
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-surface border-line w-full max-w-[460px] max-h-[88dvh] overflow-y-auto no-scrollbar rounded-2xl border p-5">
          <h3 className="text-ink text-[15px] font-medium">오브제 추가</h3>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c.key}
                onClick={() => { setCategory(c.key); setHeight(c.h); }}
                className={"rounded-md px-2.5 py-1 text-[12px] transition " +
                  (category === c.key ? "bg-accent text-bg" : "border-line text-sub border")}>{c.label}</button>
            ))}
          </div>

          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="토픽 (예: 게임)"
            className="border-line bg-bg text-ink mt-3 w-full rounded-md border px-3 py-2 text-[13px]" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
            placeholder="영어 description (비우면 토픽으로 자동 생성)"
            className="border-line bg-bg text-ink mt-2 w-full rounded-md border px-3 py-2 text-[12px]" />

          <div className="mt-2 flex gap-2">
            <button onClick={generate} disabled={busy !== null}
              className="bg-accent text-bg rounded-md px-3 py-2 text-[12px] disabled:opacity-50">
              {busy === "gen" ? "생성 중…" : "생성/미리보기"}</button>
            <label className="border-line text-sub flex cursor-pointer items-center rounded-md border px-3 py-2 text-[12px]">
              업로드<input type="file" accept="image/png" onChange={onUpload} className="hidden" /></label>
          </div>

          <div className="mt-3 flex items-center justify-center rounded-lg" style={{ minHeight: 140, background: "#26222d" }}>
            {dataUrl
              ? /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={dataUrl} alt="" style={{ imageRendering: "pixelated", maxHeight: 132, maxWidth: 200, objectFit: "contain" }} />
              )
              : <span className="text-dim text-[11px]">미리보기 없음</span>}
          </div>

          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="한글 라벨"
            className="border-line bg-bg text-ink mt-3 w-full rounded-md border px-3 py-2 text-[13px]" />
          <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="토픽들 (쉼표로 구분)"
            className="border-line bg-bg text-ink mt-2 w-full rounded-md border px-3 py-2 text-[12px]" />
          <div className="mt-2 flex items-center gap-3">
            <label className="text-sub flex items-center gap-1.5 text-[12px]">높이%
              <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))}
                className="border-line bg-bg text-ink w-16 rounded-md border px-2 py-1 text-[12px]" /></label>
            <label className="text-sub flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" checked={exemplar} onChange={(e) => setExemplar(e.target.checked)} /> 가이드 예시로</label>
          </div>

          {err && <p className="text-accent mt-2 text-[12px]">{err}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="text-sub px-3 py-2 text-[12px]">취소</button>
            <button onClick={save} disabled={busy !== null || !dataUrl}
              className="bg-accent text-bg rounded-md px-4 py-2 text-[12px] disabled:opacity-50">
              {busy === "save" ? "저장 중…" : "저장"}</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Add a delete control to `ObjectCard` (dynamic types only)**

Pass `onDelete` into `ObjectCard` from the grid (`<ObjectCard key={t.id} type={t} onDelete={load} />`) and, inside `ObjectCard`, when `t.origin === "dynamic"`, render a small delete button in the meta strip:

```tsx
        {t.origin === "dynamic" && (
          <button
            onClick={async () => {
              if (!confirm(`"${t.labelKo}" 삭제?`)) return;
              const sb = browserClient();
              const { data } = await sb.auth.getSession();
              await fetch(`/api/admin/objects?id=${t.id}`, {
                method: "DELETE",
                headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
              });
              onDelete?.();
            }}
            className="text-dim hover:text-accent mt-1 text-[10px] transition"
          >삭제</button>
        )}
```

(Update `ObjectCard`'s props type to `{ type: ObjectType; onDelete?: () => void }`.)

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS (lint warnings about `<img>` are pre-existing and suppressed inline).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/admin/objects/page.tsx"
git commit -m "feat(admin): 오브제 추가 modal + delete curated"
```

---

## Task 8: plaza-grow — expose curated objects by topic

**Files:**
- Modify: `src/lib/plaza-grow.ts`
- Test: `scripts/test-objgen-units.ts` (extend)

- [ ] **Step 1: Add a pure `selectCuratedForSlot` helper**

Add to `src/lib/plaza-grow.ts` (exported for testing). It picks the best curated catalog object for a slot:

```ts
import { catalogAll } from "@/lib/object-catalog";
import type { ObjectType } from "@/lib/object-catalog";

/** Choose the best curated catalog object for a milestone slot, or null.
 *  Filters by category + size band + not-muted, scores by implicit topic
 *  overlap, requires a positive score (no signal → caller keeps static pick). */
export function selectCuratedForSlot(
  catalog: ObjectType[],
  slot: { category: ObjectType["category"]; heightPct: number },
  topicWeights: Map<string, number>,
  mutedTypeIds: Set<string>,
): ObjectType | null {
  const lo = slot.heightPct * 0.6;
  const hi = slot.heightPct * 1.6;
  let best: ObjectType | null = null;
  let bestScore = 0;
  for (const t of catalog) {
    if (t.category !== slot.category) continue;
    if (t.variants.length === 0) continue;
    if (mutedTypeIds.has(t.id)) continue;
    if (t.nativeHeightPct < lo || t.nativeHeightPct > hi) continue;
    let score = 0;
    for (const tp of t.topics) score += topicWeights.get(tp) ?? 0;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore > 0 ? best : null;
}
```

- [ ] **Step 2: Add a `category` to each milestone + wire the selection**

In `MILESTONES`, add `category` to each entry (architectural → its catalog category; dogs → `pet`):

```ts
  // examples — set on every milestone:
  { stage: 1, daysMin: 3, messagesMin: 50, category: "landmark", place: { type: "fountain", x: 50, y: 60, scale: 0.95 } },
  { stage: 6, daysMin: 5, messagesMin: 120, category: "pet", place: { type: "dog_shiba", x: 35, y: 78 }, alternates: ["dog_maltese","dog_retriever","dog_dachshund"] },
```

Add `category: PlazaObjectType extends ... ` — concretely add `category: ObjectType["category"];` to the `Milestone` type.

Then, in the milestone loop in `tickPlazaGrowth`, AFTER computing the static `chosenTypeKey` and BEFORE the runtime-gen block, insert curated selection:

```ts
    // Curated catalog exposure: a pre-made object whose topics match the user
    // beats the static default. Runtime generation stays the last resort.
    if (chosenTypeKey === m.place.type && implicit.topics.length > 0) {
      const catalog = await catalogAll(sb);
      const curated = selectCuratedForSlot(
        catalog,
        { category: m.category, heightPct: OBJECT_CATALOG[m.place.type].nativeHeightPct },
        implicitTopicMap,
        mutedTypeIds,
      );
      if (curated) chosenTypeKey = curated.typeKey;
    }
```

And pass the slot category into the runtime-gen fallback call:

```ts
      const dyn = await tryGenerateDynamicType(sb, {
        topic: implicit.topics[0].topic,
        slotHeightPct: meta.nativeHeightPct,
        slotTopics: meta.topics ?? [],
        category: m.category,
      });
```

- [ ] **Step 3: Extend unit asserts for `selectCuratedForSlot`**

Append to `scripts/test-objgen-units.ts`:

```ts
import { selectCuratedForSlot } from "../src/lib/plaza-grow";

const mk = (id: string, category: any, h: number, topics: string[]) =>
  ({ id, typeKey: id, labelKo: id, nativeHeightPct: h, topics, category,
     origin: "dynamic", originTopic: null, originDescKey: null, usageCount: 0,
     variants: [{ id: id + "v", variantIdx: 1, spriteUrl: "u" }] }) as any;

const cat = [mk("chair", "landmark", 26, ["게임"]), mk("statue", "landmark", 28, ["역사"]), mk("toy", "prop", 12, ["게임"])];
const w = new Map([["게임", 2]]);
// picks the game-topic landmark in the landmark slot
assert.equal(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, w, new Set())?.typeKey, "chair");
// no signal → null
assert.equal(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, new Map(), new Set()), null);
// muted excluded
assert.equal(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, w, new Set(["chair"]))?.typeKey, "statue");
// wrong category not matched (prop toy not eligible for landmark slot)
assert.notEqual(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, w, new Set())?.typeKey, "toy");

console.log("✅ selectCuratedForSlot units pass");
```

- [ ] **Step 4: Run unit asserts + typecheck**

Run: `npx tsx scripts/test-objgen-units.ts`
Expected: `✅ objgen units pass` then `✅ selectCuratedForSlot units pass`
Run: `npm run typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaza-grow.ts scripts/test-objgen-units.ts
git commit -m "feat: expose curated objects by topic in plaza-grow"
```

---

## Task 9: Controlled integration + rollout

**Files:**
- Modify: `scripts/test-dyn-obj.ts` (pass `category`)

- [ ] **Step 1: Thread category through the integration test**

In `scripts/test-dyn-obj.ts`, change the call to:

```ts
  const res = await tryGenerateDynamicType(sb, {
    topic, slotHeightPct: 26, slotTopics: ["게임", "retro", "arcade"], category: "landmark",
  });
```

- [ ] **Step 2: 🔐 NEEDS USER AUTH — run the controlled gen test**

Ask the user to authorize one live generation (OpenAI cost + DB/storage write, auto-cleaned).
Run (after auth): `node --env-file=.env.local --import tsx scripts/test-dyn-obj.ts`
Expected: `✅ PASS — full pipeline works` and the printed result has `"category": "landmark"`.

- [ ] **Step 3: 🔐 NEEDS USER AUTH — build + deploy**

Ask the user to authorize the production rollout. Stop dev first, then:
Run (after auth): `npx opennextjs-cloudflare build` → `OpenNext build complete`, then `npx wrangler deploy` → `Deployed`.
Then restart dev: `rm -rf .next && NODE_ENV=development npx next dev -p 3001 &`.

- [ ] **Step 4: Manual verification (admin + plaza)**

- Admin: open `/admin/objects`, click "오브제 추가", pick category, enter a topic (e.g. "게임"), "생성/미리보기" → a sprite appears → edit label/topics → "저장" → the card shows in the grid with the right category badge.
- Confirm the controlled-test entry (if kept) or a freshly curated landmark with topic "게임" exists.
- Exposure is observable only when a world hits a milestone whose `category` matches a curated object's category with overlapping topics — note this is time/message-gated, so confirm via DB (a `plaza_objects` row pointing at the curated variant) rather than expecting instant on-screen change.

- [ ] **Step 5: Update memory pointer**

Append to `/Users/hans1/.claude/projects/-Users-hans1-EHTO/memory/MEMORY.md` a line noting the curation flow + that descriptions feed the per-tier guide (so future sessions know admin-curated objects are the primary source and runtime gen is the fallback).

---

## Self-Review Notes

- **Spec coverage:** categories (Task 1–3), curation authoring (Task 5–7), topic exposure (Task 8), guide/exemplars + gen_description (Task 4), cost guards reused (existing dynamic-object-gen). Building tier is in the schema but intentionally NOT placed (no `category:"building"` milestone) — deferred to Phase 2 with the renderer/canvas work, as the spec's rollout sequences rendering separately.
- **Out of scope (Phase 2, per spec §11/§13):** canvas widening, layered rendering (skyline/atmosphere/sky drifters/portal), sky drifters, portal. No tasks here touch the renderer.
- **Auth gates:** migration apply, live gen, deploy are explicitly user-gated (consistent with this environment's guardrails).
- **Types:** `Category` union is identical across `plaza-objects.ts`, `object-catalog.ts`, `dynamic-object-gen.ts`, the endpoints, and the modal. `selectCuratedForSlot` consumes `ObjectType` from `object-catalog.ts`.
