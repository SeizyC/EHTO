// Retry a single seed item (e.g. the one gen that transiently failed).
//   node --env-file=.env.local --import tsx scripts/seed-one.ts

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { generateObjectSpriteBytes, insertObjectType } from "@/lib/dynamic-object-gen";
import { serviceClient } from "@/lib/supabase";

type Cat = "prop" | "landmark" | "building" | "sky" | "pet";
const ITEM = { category: "landmark" as Cat, h: 24, label: "소나무", topics: ["자연", "사계절", "쉼"], desc: "a sturdy green pine tree" };

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
  const png = await generateObjectSpriteBytes(ITEM.desc, apiKey, ITEM.category);
  if (!png) { console.error("gen failed"); process.exit(1); }
  const trimmed = await trimToPng(png);
  const path = `objects/curated/${randomUUID()}.png`;
  const up = await sb.storage.from("characters").upload(path, trimmed, { contentType: "image/png", upsert: false });
  if (up.error) { console.error("upload:", up.error.message); process.exit(1); }
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/characters/${path}`;
  const created = await insertObjectType(sb, {
    typeKey: `cur_${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 16)}`,
    labelKo: ITEM.label, nativeHeightPct: ITEM.h, topics: ITEM.topics, category: ITEM.category,
    genDescription: ITEM.desc, isExemplar: true, originTopic: ITEM.topics[0] ?? null, originDescKey: null, spriteUrl: url,
  });
  console.log(created ? `✓ ${ITEM.label}` : "✗ insert failed");
}

main().catch((e) => { console.error(e); process.exit(1); });
