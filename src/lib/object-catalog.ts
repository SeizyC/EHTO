// DB-backed object catalog accessor.
//
// Replaces the old code-constant OBJECT_CATALOG (lib/plaza-objects.ts)
// for runtime use. Server reads object_types + object_variants once
// per CACHE_TTL_MS and serves it to the API enrich layer so each
// placement response carries spriteUrl/nativeHeightPct/labelKo without
// PlazaCanvas needing to know the catalog shape.
//
// The plaza-objects.ts constant remains as the SOURCE OF TRUTH for
// the static set — scripts/bootstrap-object-catalog.mjs reads it and
// upserts. Once that has run, runtime queries DB.
//
// Spec: docs/superpowers/specs/2026-05-31-dynamic-object-generation-design.md

import type { SupabaseClient } from "@supabase/supabase-js";

export type ObjectVariant = {
  id: string;
  variantIdx: number;
  spriteUrl: string;
};

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

const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { at: number; byId: Map<string, ObjectType>; byKey: Map<string, ObjectType>; byVariantId: Map<string, ObjectType> };
let _cache: CacheEntry | null = null;

/** Drop the catalog cache. Call after inserting a new dynamic type or
 *  a new variant so the next read sees fresh state. */
export function invalidateCatalog(): void {
  _cache = null;
}

async function loadCatalog(sb: SupabaseClient): Promise<CacheEntry> {
  // Single round-trip: type + every variant joined via PostgREST embed.
  // 5-minute cache covers the ambient tick rate (every 8s) and the
  // API enrich path comfortably.
  const { data: typeRows, error } = await sb
    .from("object_types")
    .select("id, type_key, label_ko, native_height_pct, topics, category, origin, origin_topic, origin_desc_key, usage_count, object_variants(id, variant_idx, sprite_url)");
  if (error) {
    console.warn("[catalog] load failed:", error.message);
    return { at: Date.now(), byId: new Map(), byKey: new Map(), byVariantId: new Map() };
  }
  const byId = new Map<string, ObjectType>();
  const byKey = new Map<string, ObjectType>();
  const byVariantId = new Map<string, ObjectType>();
  for (const r of typeRows ?? []) {
    const rawVariants = (r as { object_variants?: Array<{ id: string; variant_idx: number; sprite_url: string }> }).object_variants ?? [];
    const variants: ObjectVariant[] = rawVariants
      .map((v) => ({ id: v.id, variantIdx: v.variant_idx, spriteUrl: v.sprite_url }))
      .sort((a, b) => a.variantIdx - b.variantIdx);
    const type: ObjectType = {
      id: r.id as string,
      typeKey: r.type_key as string,
      labelKo: r.label_ko as string,
      nativeHeightPct: r.native_height_pct as number,
      topics: (r.topics ?? []) as string[],
      category: ((r as { category?: string }).category ?? "prop") as ObjectType["category"],
      origin: r.origin as "static" | "dynamic",
      originTopic: (r.origin_topic ?? null) as string | null,
      originDescKey: (r.origin_desc_key ?? null) as string | null,
      usageCount: (r.usage_count ?? 0) as number,
      variants,
    };
    byId.set(type.id, type);
    byKey.set(type.typeKey, type);
    for (const v of variants) byVariantId.set(v.id, type);
  }
  return { at: Date.now(), byId, byKey, byVariantId };
}

async function getCache(sb: SupabaseClient): Promise<CacheEntry> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache;
  _cache = await loadCatalog(sb);
  return _cache;
}

export async function catalogByVariantId(
  sb: SupabaseClient,
  variantId: string,
): Promise<ObjectType | null> {
  const c = await getCache(sb);
  return c.byVariantId.get(variantId) ?? null;
}

export async function catalogByTypeKey(
  sb: SupabaseClient,
  typeKey: string,
): Promise<ObjectType | null> {
  const c = await getCache(sb);
  return c.byKey.get(typeKey) ?? null;
}

export async function catalogByTypeId(
  sb: SupabaseClient,
  typeId: string,
): Promise<ObjectType | null> {
  const c = await getCache(sb);
  return c.byId.get(typeId) ?? null;
}

export async function catalogAll(sb: SupabaseClient): Promise<ObjectType[]> {
  const c = await getCache(sb);
  return Array.from(c.byId.values());
}

/** Pick a random variant from a type. Used by plaza-grow when placing
 *  a new milestone object — multiple variants means same logical type
 *  shows different sprites across worlds (or even within one world). */
export function pickRandomVariant(type: ObjectType): ObjectVariant | null {
  if (type.variants.length === 0) return null;
  return type.variants[Math.floor(Math.random() * type.variants.length)];
}
