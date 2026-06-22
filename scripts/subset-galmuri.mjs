// Subset the Galmuri11 pixel font to just what the landing needs.
//
// Galmuri11 (regular 505KB + bold 167KB) is the full Korean pixel font, but
// `.font-pixel` is used in EXACTLY one place — the landing headline / sub /
// CTA (see LandingClient.tsx). Shipping the whole 670KB put a 500KB font on
// the LCP critical chain (HTML → CSS → Galmuri11.woff2), dragging simulated
// mobile LCP to ~6.9s even though font-display:swap kept FCP fast.
//
// We subset to the glyphs in LANDING (all locales) + Basic Latin so the LCP
// headline paints in the pixel font without a 500KB download. Output:
//   Galmuri11.subset.woff2 / Galmuri11-Bold.subset.woff2
//
// Re-run whenever the landing copy changes:  node scripts/subset-galmuri.mjs

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;

// Pull every quoted string out of the LANDING block so the charset stays in
// sync with the actual copy (headline / sub / cta across ko·en·ja).
const tsSrc = readFileSync(root + "src/lib/about-content.ts", "utf8");
const block = tsSrc.match(/export const LANDING[\s\S]*?\n};/)?.[0] ?? "";
const copy = [...block.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]).join("");

// Always keep Basic Latin + digits + common punctuation + arrows so Latin
// copy tweaks and the PixelButton chrome never tofu without a regen.
const LATIN =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
const ARROWS = "→←↑↓·";

const charset = [...new Set([...copy, ...LATIN, ...ARROWS])].join("");

const FONTS = [
  ["public/fonts/Galmuri11.woff2", "public/fonts/Galmuri11.subset.woff2"],
  ["public/fonts/Galmuri11-Bold.woff2", "public/fonts/Galmuri11-Bold.subset.woff2"],
];

for (const [src, out] of FONTS) {
  execFileSync(
    "pyftsubset",
    [
      root + src,
      "--text=" + charset,
      "--flavor=woff2",
      "--output-file=" + root + out,
      "--layout-features=*",
      "--no-hinting",
      "--desubroutinize",
    ],
    { stdio: "inherit" },
  );
}

console.log(`✓ subset ${charset.length} glyphs → Galmuri11.subset.woff2 / Galmuri11-Bold.subset.woff2`);
