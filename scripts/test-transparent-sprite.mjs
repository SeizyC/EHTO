#!/usr/bin/env node
// Quick test: generate one character sprite using gpt-image-1 with
// background: "transparent" — verifies output quality is acceptable
// before we strip out the legacy Python chroma pipeline.
//
// Usage:
//   node scripts/test-transparent-sprite.mjs
// Output: /tmp/sprite-transparent-test.png
//
// Reads OPENAI_API_KEY from .env.local.

import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const apiKey = env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY missing in .env.local");
  process.exit(1);
}

// Same prompt structure as src/lib/prompts.ts buildPrompt() — a moderately
// distinctive choice so we can see if persona-level detail survives the
// transparent-bg pipeline.
const prompt = [
  "A pixel art character sprite, modern social-app style, 3/4 front isometric view,",
  "standing idle pose on flat ground,",
  "head about 1/3 of total height — large enough that the face is clearly readable at small sizes,",
  "clearly visible front-facing face with recognizable features (two distinct eyes, nose, mouth), olive skin tone,",
  "feminine looking person, warm brown shoulder length wavy hair,",
  "streetwear outfit, oversized hoodie, baggy cargo pants, chunky sneakers,",
  "small subtle earrings,",
  "limited color palette 8-10 colors, soft 1px outline, no anti-aliasing,",
  "fully transparent background — the API returns PNG with alpha channel,",
  "full body visible from head to feet, no shadow, no environment,",
  "pixel-perfect clean lines, retro pixel game aesthetic but contemporary urban not fantasy,",
  "the character occupies the center 70% of the frame,",
  "face must be readable — do NOT obscure with hat brim, hood, hair covering eyes, or facing away,",
  "not faceless, not anime chibi, not fantasy RPG, no animal features, no weapons, contemporary social character",
].join(" ");

console.log("Calling gpt-image-1 (background: transparent)...");
const t0 = Date.now();
const resp = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "high",
    background: "transparent",
  }),
});

const ms = Date.now() - t0;
if (!resp.ok) {
  const text = await resp.text();
  console.error(`HTTP ${resp.status} (${ms}ms):`, text.slice(0, 500));
  process.exit(2);
}
const j = await resp.json();
const b64 = j?.data?.[0]?.b64_json;
if (!b64) {
  console.error("No b64_json in response:", JSON.stringify(j).slice(0, 500));
  process.exit(3);
}

const out = "/tmp/sprite-transparent-test.png";
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log(`OK (${ms}ms) → ${out}`);
console.log("Open it to inspect transparency + pixel quality.");
