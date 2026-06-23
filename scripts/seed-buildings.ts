// Extra building seeds. Same pipeline as seed-catalog (generate → trim →
// palette PNG → upload → insert as exemplar). Run once.
//   node --env-file=.env.local --import tsx scripts/seed-buildings.ts

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { generateObjectSpriteBytes, insertObjectType } from "@/lib/dynamic-object-gen";
import { serviceClient } from "@/lib/supabase";

const H = 38;
const SEED: Array<{ label: string; topics: string[]; desc: string }> = [
  { label: "PC방", topics: ["게임", "야간", "친구"], desc: "a small internet PC cafe storefront with glowing neon signage and a glass door" },
  { label: "편의점", topics: ["일상", "야식", "거리"], desc: "a small 24-hour convenience store storefront with bright signage and a glass front" },
  { label: "분식집", topics: ["음식", "추억", "일상"], desc: "a small Korean street-food snack shop storefront with a red awning" },
  { label: "꽃집", topics: ["식물", "선물", "위안"], desc: "a small flower shop storefront with buckets of fresh flowers outside" },
  { label: "빵집", topics: ["음식", "아침", "위안"], desc: "a small bakery storefront with a warm window display of bread and pastries" },
];

async function trimToPng(buf: Buffer): Promise<Buffer> {
  const m = await sharp(buf).metadata();
  const W = m.width ?? 0, Ht = m.height ?? 0;
  const ring = W && Ht ? Math.max(4, Math.round(W * 0.006)) : 0;
  let pipe = sharp(buf).ensureAlpha();
  if (ring) {
    pipe = pipe
      .extract({ left: ring, top: ring, width: W - 2 * ring, height: Ht - 2 * ring })
      .extend({ top: ring, bottom: ring, left: ring, right: ring, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  return pipe.png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 }).toBuffer();
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error("no key"); process.exit(1); }
  const sb = serviceClient();
  let ok = 0;
  for (const s of SEED) {
    const t0 = Date.now();
    try {
      const png = await generateObjectSpriteBytes(s.desc, apiKey, "building");
      if (!png) { console.warn(`✗ gen: ${s.label}`); continue; }
      const trimmed = await trimToPng(png);
      const path = `objects/curated/${randomUUID()}.png`;
      const up = await sb.storage.from("characters").upload(path, trimmed, { contentType: "image/png", upsert: false });
      if (up.error) { console.warn(`✗ upload: ${s.label}: ${up.error.message}`); continue; }
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/characters/${path}`;
      const created = await insertObjectType(sb, {
        typeKey: `cur_${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 16)}`,
        labelKo: s.label, nativeHeightPct: H, topics: s.topics, category: "building",
        genDescription: s.desc, isExemplar: true, originTopic: s.topics[0] ?? null, originDescKey: null, spriteUrl: url,
      });
      if (!created) { console.warn(`✗ insert: ${s.label}`); continue; }
      ok++;
      console.log(`✓ building ${s.label}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      console.warn(`✗ ${s.label}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\nseeded ${ok}/${SEED.length} buildings`);
}

main().catch((e) => { console.error(e); process.exit(1); });
