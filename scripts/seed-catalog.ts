// Seed the object catalog with a curated starter set: 1-2 per category + a few
// diverse trees. Generates (gpt-image-1), trims the edge frame (sharp), uploads,
// and inserts as is_exemplar=true so they also seed the per-tier style guide.
//
//   node --env-file=.env.local --import tsx scripts/seed-catalog.ts
//
// One-off. Re-running creates duplicates (cur_<random> keys), so run once.

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { generateObjectSpriteBytes, insertObjectType } from "@/lib/dynamic-object-gen";
import { serviceClient } from "@/lib/supabase";

type Cat = "prop" | "landmark" | "building" | "sky" | "pet";
type Seed = { category: Cat; desc: string; label: string; topics: string[]; h: number };

const SEED: Seed[] = [
  // props (small)
  { category: "prop", h: 13, label: "우체통", topics: ["거리", "추억", "일상"], desc: "a glossy red vintage mailbox on a short post" },
  { category: "prop", h: 13, label: "가판대", topics: ["거리", "일상", "뉴스"], desc: "a small wooden newspaper stand with folded papers" },
  // landmarks — trees (diverse) + a couple others
  { category: "landmark", h: 24, label: "벚꽃나무", topics: ["봄", "자연", "산책"], desc: "a blossoming pink cherry tree in full bloom" },
  { category: "landmark", h: 24, label: "단풍나무", topics: ["가을", "자연", "쉼"], desc: "a tall maple tree with bright red autumn leaves" },
  { category: "landmark", h: 24, label: "소나무", topics: ["자연", "사계절", "쉼"], desc: "a sturdy green pine tree" },
  { category: "landmark", h: 22, label: "조각상", topics: ["예술", "책", "사색"], desc: "a small bronze street statue of a person reading a book, on a stone pedestal" },
  { category: "landmark", h: 22, label: "버스정류장", topics: ["거리", "일상", "기다림"], desc: "a glass bus stop shelter with a small bench" },
  // buildings
  { category: "building", h: 38, label: "카페", topics: ["쉼", "커피", "대화"], desc: "a cozy small corner cafe storefront with a striped awning" },
  { category: "building", h: 38, label: "서점", topics: ["책", "독서", "사색"], desc: "a small neighborhood bookstore storefront with book-filled window displays" },
  // sky (small, side profile via category prompt)
  { category: "sky", h: 10, label: "구름", topics: ["하늘", "날씨", "평온"], desc: "a single fluffy white cumulus cloud" },
  { category: "sky", h: 11, label: "열기구", topics: ["여행", "몽상", "모험"], desc: "a red hot-air balloon with a wicker basket" },
  // pet
  { category: "pet", h: 6, label: "고양이", topics: ["반려", "귀여움", "쉼"], desc: "a small orange tabby cat sitting" },
];

// Trim the edge frame AND output webp — sharp-re-encoded PNGs blow past the
// storage bucket's file-size limit (and bloat the plaza), webp is ~1/10 with
// transparency intact.
async function trimToWebp(buf: Buffer): Promise<Buffer> {
  const m = await sharp(buf).metadata();
  const W = m.width ?? 0, H = m.height ?? 0;
  const ring = W && H ? Math.max(4, Math.round(W * 0.006)) : 0;
  let pipe = sharp(buf).ensureAlpha();
  if (ring) {
    pipe = pipe
      .extract({ left: ring, top: ring, width: W - 2 * ring, height: H - 2 * ring })
      .extend({ top: ring, bottom: ring, left: ring, right: ring, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  return pipe.webp({ quality: 85 }).toBuffer();
}

async function uploadWebp(sb: ReturnType<typeof serviceClient>, buf: Buffer): Promise<string | null> {
  const path = `objects/curated/${randomUUID()}.webp`;
  const { error } = await sb.storage.from("characters").upload(path, buf, { contentType: "image/webp", upsert: false });
  if (error) { console.warn("upload:", error.message); return null; }
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/characters/${path}`;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error("OPENAI_API_KEY missing"); process.exit(1); }
  const sb = serviceClient();

  let ok = 0;
  for (const s of SEED) {
    const t0 = Date.now();
    try {
      const png = await generateObjectSpriteBytes(s.desc, apiKey, s.category);
      if (!png) { console.warn(`✗ gen failed: ${s.label}`); continue; }
      const webp = await trimToWebp(png);
      const url = await uploadWebp(sb, webp);
      if (!url) { console.warn(`✗ upload failed: ${s.label}`); continue; }
      const typeKey = `cur_${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 16)}`;
      const created = await insertObjectType(sb, {
        typeKey, labelKo: s.label, nativeHeightPct: s.h, topics: s.topics,
        category: s.category, genDescription: s.desc, isExemplar: true,
        originTopic: s.topics[0] ?? null, originDescKey: null, spriteUrl: url,
      });
      if (!created) { console.warn(`✗ insert failed: ${s.label}`); continue; }
      ok++;
      console.log(`✓ ${s.category.padEnd(9)} ${s.label}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      console.warn(`✗ error: ${s.label}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\nseeded ${ok}/${SEED.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
