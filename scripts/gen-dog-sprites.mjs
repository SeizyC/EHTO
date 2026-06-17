#!/usr/bin/env node
// Generates 4 dog sprite PNGs via gpt-image-1 (transparent background)
// and writes them to public/sprites/rooms/objects/.
//
// Prompt style mirrors existing object sprites (fountain, bench, etc.)
// — chunky Habbo-ish pixel art, limited palette, soft 1px outline.
//
// Usage:  node scripts/gen-dog-sprites.mjs

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
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

const baseStyle = [
  "Pixel art sprite of a single small dog,",
  "Habbo-style chunky proportions, slightly stylized cute,",
  "limited color palette 6-8 colors, soft 1px outline, no anti-aliasing,",
  "3/4 isometric front view at floor level,",
  "fully transparent background — PNG with alpha channel,",
  "no shadow, no environment, no text, no border,",
  "centered occupying about 70% of the frame,",
  "clean pixel-perfect lines, retro pixel game aesthetic,",
  "contemporary social-app style consistent with other small plaza objects (benches, planters),",
  "NOT realistic, NOT photographic, NOT 3D rendered, NOT illustration — strictly pixel-art sprite",
].join(" ");

const dogs = [
  {
    file: "dog_shiba_sitting.png",
    desc: "a shiba inu sitting calmly on the ground, cream-colored fur with white belly, curled tail, alert ears, neutral happy expression, side-on view facing right",
  },
  {
    file: "dog_maltese_wagging.png",
    desc: "a small white maltese dog standing with tail visibly wagging (motion implied by tail angle), fluffy fur, dark eyes and nose, slight playful pose facing forward",
  },
  {
    file: "dog_retriever_sleeping.png",
    desc: "a golden retriever curled up asleep on the ground, eyes closed, golden fur, paws tucked under, peaceful round shape",
  },
  {
    file: "dog_dachshund_standing.png",
    desc: "a brown dachshund standing on all fours with the characteristic long body and short legs, floppy ears, alert posture, side-on view facing left",
  },
];

async function generate(d) {
  const prompt = `${baseStyle} The dog is ${d.desc}.`;
  console.log(`→ ${d.file}: requesting...`);
  const t0 = Date.now();
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    const t = await resp.text().catch(() => "");
    console.error(`  ✗ HTTP ${resp.status} (${ms}ms): ${t.slice(0, 200)}`);
    return false;
  }
  const j = await resp.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) { console.error(`  ✗ no b64_json`); return false; }
  const out = path.join(process.cwd(), "public", "sprites", "rooms", "objects", d.file);
  fs.writeFileSync(out, Buffer.from(b64, "base64"));
  console.log(`  ✓ ${out} (${ms}ms)`);
  return true;
}

// Generate in parallel (OpenAI tolerates ~5 concurrent image requests at this tier).
const results = await Promise.all(dogs.map(generate));
const ok = results.filter(Boolean).length;
console.log(`\nDone: ${ok}/${dogs.length} sprites generated.`);
