// Retroactively strip the thin edge frame from already-saved dynamic object
// sprites — no regeneration (no OpenAI cost). Downloads each variant PNG,
// clears a ~6px transparent border via sharp (crop inward + re-pad transparent,
// same dimensions/position), uploads to a NEW path, and points the variant at
// it. New path busts any CDN cache.
//
//   node --env-file=.env.local --import tsx scripts/retrim-objects.ts
//
// Idempotent-ish: re-running trims another ring (~6px). Run once.

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { serviceClient } from "@/lib/supabase";

const BUCKET = "characters";

async function main() {
  const sb = serviceClient();

  const { data: types } = await sb.from("object_types").select("id").eq("origin", "dynamic");
  const typeIds = (types ?? []).map((t) => (t as { id: string }).id);
  if (typeIds.length === 0) { console.log("no dynamic types"); return; }

  const { data: variants } = await sb
    .from("object_variants")
    .select("id, sprite_url, type_id")
    .in("type_id", typeIds);

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let done = 0;
  for (const v of variants ?? []) {
    const { id, sprite_url } = v as { id: string; sprite_url: string };
    try {
      const buf = Buffer.from(await (await fetch(sprite_url)).arrayBuffer());
      const meta = await sharp(buf).metadata();
      const W = meta.width ?? 0, H = meta.height ?? 0;
      if (!W || !H) { console.warn("skip (no dims)", id); continue; }
      const ring = Math.max(4, Math.round(W * 0.006));
      const out = await sharp(buf)
        .ensureAlpha()
        .extract({ left: ring, top: ring, width: W - 2 * ring, height: H - 2 * ring })
        .extend({ top: ring, bottom: ring, left: ring, right: ring, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 }) // palette PNG: bucket allows only image/png ≤2MB
        .toBuffer();
      const path = `objects/curated/${randomUUID()}.png`;
      const up = await sb.storage.from(BUCKET).upload(path, out, { contentType: "image/png", upsert: false });
      if (up.error) { console.warn("upload fail", id, up.error.message); continue; }
      const newUrl = `${base}/storage/v1/object/public/${BUCKET}/${path}`;
      const upd = await sb.from("object_variants").update({ sprite_url: newUrl }).eq("id", id);
      if (upd.error) { console.warn("db fail", id, upd.error.message); continue; }
      console.log(`✓ retrimmed ${id} (ring ${ring}px) → ${path}`);
      done++;
    } catch (e) {
      console.warn("error", id, e instanceof Error ? e.message : e);
    }
  }
  console.log(`done: ${done}/${(variants ?? []).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
