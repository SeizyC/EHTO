// One-off-ish landing image optimizer (reproducible).
//
// The landing's pixel-art webp assets were heavier than they need to be on
// mobile. Since everything renders with `image-rendering: pixelated`, modest
// downscaling + a q80 re-encode is visually ~identical (nearest-neighbour
// upscale stays crisp-blocky) while cutting bytes that compete on slow 4G.
//
// Policy:
//   · scene backgrounds (LCP, full-width) → 768w  (mobile ~412 @2x, desktop
//     680 upscaled via pixelated = fine), q80
//   · logo wordmark (78×30 display) → 256w (>3x), q80
//   · furniture / hero sprites → re-encode SAME size at q80 only. They're sized
//     for desktop-retina, so downscaling would hurt large screens.
//
// Only writes an output if it's actually smaller. Originals remain in git
// history. Re-run after replacing any source art: node scripts/optimize-landing-images.mjs

import { writeFileSync, statSync, readdirSync } from "node:fs";
import sharp from "sharp";

const root = new URL("..", import.meta.url).pathname;

/** files to DOWNSCALE to a target width + q80 */
const DOWNSCALE = [
  ...["morning", "afternoon", "evening", "night"].map((s) => ({
    file: `public/sprites/rooms/states/empty_${s}.land.webp`,
    width: 768,
  })),
  { file: "public/logo_ehto_wordmark.webp", width: 256 },
];

/** dirs whose *.land.webp get RE-ENCODED same-size at q80 */
const REENCODE_DIRS = ["public/sprites/rooms/objects", "public/sprites/hero"];

const Q = 80;

async function maybeWrite(file, buffer) {
  const before = statSync(root + file).size;
  if (buffer.length < before) {
    writeFileSync(root + file, buffer);
    console.log(`  ✓ ${file.split("/").pop().padEnd(34)} ${(before / 1024).toFixed(1)}KB → ${(buffer.length / 1024).toFixed(1)}KB`);
    return before - buffer.length;
  }
  console.log(`  · ${file.split("/").pop().padEnd(34)} kept (${(before / 1024).toFixed(1)}KB; re-encode wasn't smaller)`);
  return 0;
}

let saved = 0;

console.log("Downscale + q80:");
for (const { file, width } of DOWNSCALE) {
  const out = await sharp(root + file).resize(width, null, { kernel: "lanczos3" }).webp({ quality: Q }).toBuffer();
  saved += await maybeWrite(file, out);
}

console.log("Re-encode (same size) q80:");
const reencodeFiles = REENCODE_DIRS.flatMap((d) =>
  readdirSync(root + d).filter((f) => f.endsWith(".land.webp")).map((f) => `${d}/${f}`),
);
for (const file of reencodeFiles) {
  const out = await sharp(root + file).webp({ quality: Q }).toBuffer();
  saved += await maybeWrite(file, out);
}

console.log(`\nTotal saved: ${(saved / 1024).toFixed(1)}KB`);
