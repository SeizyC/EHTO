// Bootstrap the DB-backed object catalog from the existing OBJECT_CATALOG
// code constant. Idempotent — re-runnable, no duplicates.
//
// Steps:
//   1. UPSERT one object_types row per static catalog entry
//      (origin='static', type_key = enum key)
//   2. UPSERT one object_variants row per type (variant_idx=1)
//      sprite_url = current PNG path under /public/sprites/rooms/objects/
//   3. Backfill plaza_objects.variant_id where it's NULL by joining
//      plaza_objects.type → object_types.type_key → first variant id
//
// Spec: docs/superpowers/specs/2026-05-31-dynamic-object-generation-design.md

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!(k in process.env)) process.env[k] = v;
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Source of truth — must stay in sync with src/lib/plaza-objects.ts
// OBJECT_CATALOG. Bootstrap re-runs after a catalog tweak (e.g. new
// nativeHeightPct after the 9% → 12% character bump) will reapply the
// numbers via the upsert.
const STATIC_CATALOG = [
  { type_key: "fountain", label_ko: "분수대",   native_height_pct: 24,  topics: ["중앙", "공공", "클래식"], sprite: "/sprites/rooms/objects/fountain.png" },
  { type_key: "bench",    label_ko: "벤치",     native_height_pct: 12,  topics: ["휴식", "독서", "대화"],   sprite: "/sprites/rooms/objects/bench.png" },
  { type_key: "planter",  label_ko: "화분",     native_height_pct: 8.5, topics: ["식물", "소소함"],         sprite: "/sprites/rooms/objects/planter.png" },
  { type_key: "lamp",     label_ko: "가로등",   native_height_pct: 33,  topics: ["밤", "분위기", "거리"],   sprite: "/sprites/rooms/objects/lamp.png" },
  { type_key: "tree",     label_ko: "나무",     native_height_pct: 44,  topics: ["자연", "계절", "쉼"],     sprite: "/sprites/rooms/objects/tree.png" },
  { type_key: "dog_shiba",     label_ko: "시바",     native_height_pct: 4.5, topics: ["반려", "활기", "귀여움"], sprite: "/sprites/rooms/objects/dog_shiba_sitting.png" },
  { type_key: "dog_maltese",   label_ko: "말티즈",   native_height_pct: 4.5, topics: ["반려", "귀여움"],         sprite: "/sprites/rooms/objects/dog_maltese_wagging.png" },
  { type_key: "dog_retriever", label_ko: "리트리버", native_height_pct: 3,   topics: ["반려", "쉼"],             sprite: "/sprites/rooms/objects/dog_retriever_sleeping.png" },
  { type_key: "dog_dachshund", label_ko: "닥스훈트", native_height_pct: 4.5, topics: ["반려", "귀여움"],         sprite: "/sprites/rooms/objects/dog_dachshund_standing.png" },
];

// 1) UPSERT static types.
const typeRows = STATIC_CATALOG.map((c) => ({
  type_key: c.type_key,
  label_ko: c.label_ko,
  native_height_pct: c.native_height_pct,
  topics: c.topics,
  origin: "static",
}));
const { data: upTypes, error: upErr } = await sb
  .from("object_types")
  .upsert(typeRows, { onConflict: "type_key", ignoreDuplicates: false })
  .select("id, type_key");
if (upErr) { console.error("type upsert failed:", upErr.message); process.exit(2); }
console.log(`✓ object_types: ${upTypes.length} rows upserted`);

const idByKey = new Map(upTypes.map((t) => [t.type_key, t.id]));

// 2) UPSERT first variant per type.
const variantRows = STATIC_CATALOG.map((c) => ({
  type_id: idByKey.get(c.type_key),
  variant_idx: 1,
  sprite_url: c.sprite,
}));
const { data: upVariants, error: vErr } = await sb
  .from("object_variants")
  .upsert(variantRows, { onConflict: "type_id,variant_idx", ignoreDuplicates: false })
  .select("id, type_id, variant_idx, sprite_url");
if (vErr) { console.error("variant upsert failed:", vErr.message); process.exit(2); }
console.log(`✓ object_variants: ${upVariants.length} rows upserted`);

const v1ByTypeId = new Map(
  upVariants.filter((v) => v.variant_idx === 1).map((v) => [v.type_id, v.id]),
);

// 3) Backfill plaza_objects.variant_id for rows that still have NULL.
// We can't do this in a single UPDATE because the type→variant mapping
// is a map in JS; do it per static type.
let totalBackfilled = 0;
for (const c of STATIC_CATALOG) {
  const typeId = idByKey.get(c.type_key);
  const variantId = v1ByTypeId.get(typeId);
  if (!typeId || !variantId) continue;
  const { error, count } = await sb
    .from("plaza_objects")
    .update({ variant_id: variantId }, { count: "exact" })
    .eq("type", c.type_key)
    .is("variant_id", null);
  if (error) { console.warn(`  backfill ${c.type_key}:`, error.message); continue; }
  if (count) {
    console.log(`  ${c.type_key}: backfilled ${count} placements`);
    totalBackfilled += count;
  }
}
console.log(`✓ plaza_objects backfill: ${totalBackfilled} total`);

// Sanity counts
const { count: typeCount } = await sb.from("object_types").select("id", { count: "exact", head: true });
const { count: variantCount } = await sb.from("object_variants").select("id", { count: "exact", head: true });
const { count: unboundCount } = await sb.from("plaza_objects").select("id", { count: "exact", head: true }).is("variant_id", null);
console.log(`\nDB state:`);
console.log(`  object_types     = ${typeCount}`);
console.log(`  object_variants  = ${variantCount}`);
console.log(`  plaza_objects unbound (variant_id IS NULL) = ${unboundCount}`);
if (unboundCount > 0) {
  console.log(`  (unbound rows are likely from removed enum types — safe to ignore)`);
}
