// One-shot: generate landing-optimized WebP variants of the public assets the
// marketing pages (/, /login, /signup, /about) load. The landing renders these
// at small sizes but currently ships the full-res PNG masters (~11 MB total on
// first paint). We emit downscaled WebP (~2x display size) so the in-app world
// keeps the high-res masters untouched. Run: `node scripts/optimize-landing-assets.mjs`.
import sharp from "sharp";
import { stat } from "node:fs/promises";
import path from "node:path";

const PUB = path.resolve("public");

// [src, out, { width | height }] — target ~2x the max on-screen size.
const JOBS = [
  // Wordmark: max display 170x66 (login/signup). 512w covers 3x.
  // Master lives in assets-src/ (kept out of public/ so it isn't deployed).
  ["../assets-src/masters/logo_ehto_wordmark.png", "logo_ehto_wordmark.webp", { width: 512 }],
  // Scene backgrounds: rendered ≤680px wide. 1024w is ample.
  ["sprites/rooms/states/empty_morning.png", "sprites/rooms/states/empty_morning.land.webp", { width: 1024 }],
  ["sprites/rooms/states/empty_afternoon.png", "sprites/rooms/states/empty_afternoon.land.webp", { width: 1024 }],
  ["sprites/rooms/states/empty_evening.png", "sprites/rooms/states/empty_evening.land.webp", { width: 1024 }],
  ["sprites/rooms/states/empty_night.png", "sprites/rooms/states/empty_night.land.webp", { width: 1024 }],
  // Objects: keyed by display height (% of ~453px container) x2.
  ["sprites/rooms/objects/tree.png", "sprites/rooms/objects/tree.land.webp", { height: 256 }],
  ["sprites/rooms/objects/lamp.png", "sprites/rooms/objects/lamp.land.webp", { height: 256 }],
  ["sprites/rooms/objects/fountain.png", "sprites/rooms/objects/fountain.land.webp", { height: 256 }],
  ["sprites/rooms/objects/bench.png", "sprites/rooms/objects/bench.land.webp", { height: 160 }],
  ["sprites/rooms/objects/dog_maltese_wagging.png", "sprites/rooms/objects/dog_maltese_wagging.land.webp", { height: 96 }],
  // Hero residents: tallest display ~77px -> 192 height.
  ["sprites/hero/test_01.png", "sprites/hero/test_01.land.webp", { height: 192 }],
  ["sprites/hero/test_02.png", "sprites/hero/test_02.land.webp", { height: 192 }],
  ["sprites/hero/test_03.png", "sprites/hero/test_03.land.webp", { height: 192 }],
  ["sprites/hero/test_04.png", "sprites/hero/test_04.land.webp", { height: 192 }],
  ["sprites/hero/test_05.png", "sprites/hero/test_05.land.webp", { height: 192 }],
];

let before = 0;
let after = 0;
for (const [src, out, resize] of JOBS) {
  const srcPath = path.join(PUB, src);
  const outPath = path.join(PUB, out);
  const inBytes = (await stat(srcPath)).size;
  await sharp(srcPath)
    .resize({ ...resize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(outPath);
  const outBytes = (await stat(outPath)).size;
  before += inBytes;
  after += outBytes;
  const pct = ((1 - outBytes / inBytes) * 100).toFixed(0);
  console.log(`${out.padEnd(52)} ${(inBytes / 1024).toFixed(0).padStart(5)}KB -> ${(outBytes / 1024).toFixed(0).padStart(4)}KB  (-${pct}%)`);
}
console.log(`\nTOTAL  ${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB  (-${((1 - after / before) * 100).toFixed(1)}%)`);
