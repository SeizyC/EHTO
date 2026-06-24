// Regenerate the curated BUILDING sprites with distinct silhouettes so they
// stop reading as the same boxy storefront. Each gets a hand-written, form-
// varied description; the improved building CATEGORY_CUE + isometric 3/4 view
// (dynamic-object-gen) give each a different roofline/height/facade.
//
//   node --env-file=.env.local scripts/regen-buildings.mjs [--dry]

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { generateObjectSpriteBytes, uploadObjectSprite } from "../src/lib/dynamic-object-gen.ts";

// The `characters` bucket caps objects at 2MB; gpt-image full-colour PNGs blow
// past that. Re-encode to a palette PNG (keeps alpha) and step colours down
// until it fits.
async function fit(png) {
  for (const colors of [256, 192, 128, 96]) {
    const out = await sharp(png).png({ palette: true, colors, compressionLevel: 9, effort: 9 }).toBuffer();
    if (out.length <= 2_000_000) return out;
  }
  return sharp(png).png({ palette: true, colors: 64, compressionLevel: 9 }).toBuffer();
}

const DRY = process.argv.includes("--dry");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI = process.env.OPENAI_API_KEY;
if (!URL || !SERVICE || !OPENAI) { console.error("missing env"); process.exit(1); }
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

// type_key → { variantId, desc } — distinct architectural forms.
const BUILDINGS = [
  ["cur_201d23010af78760", "92268760-9fec-45d1-934d-7d8b6f0bc71c", "cozy two-story corner coffee house with a striped awning, a big warm glowing window, and a small rooftop terrace"],
  ["cur_3118476158ac4601", "0d7c953d-471a-46b9-abda-885bc77dd258", "boxy neon-lit internet gaming cafe, dark facade with bright blue and pink neon signage and glowing windows"],
  ["cur_34c386b378bf4da5", "ae7da37b-e7e0-4bd0-9c27-44f5cae46676", "tiny old-school Korean snack diner, single story with a faded red sign and a steamy open front counter"],
  ["cur_5764d200f761858c", "99a4d3cc-b441-49f5-a255-93637f18990b", "tall narrow three-story bookshop with arched windows, a wooden hanging sign, and books stacked in the window"],
  ["cur_a8e1bf24ab7badd2", "80f3f36f-92b6-4c92-a837-4b5342af1bad", "charming bakery with a peaked gabled roof, a striped canopy over the door, and a bread-loaf sign"],
  ["cur_a9c5a6da9d952430", "22f2ea27-3187-4993-a2c6-68999937f7f1", "small modern convenience store, flat roof, bright white and green glowing storefront with a full glass front"],
  ["cur_b0f9536248a3d4e4", "25ecc7f0-c75d-4679-9283-ef7f094c24b2", "vintage music instrument shop with a marquee sign and a guitar hanging in the display window"],
  ["cur_c184898735124306", "a58d31f4-8680-41db-801d-b0b84c58650e", "glass greenhouse flower shop with a curved glass roof and wooden flower boxes out front"],
];

console.log(`Regenerating ${BUILDINGS.length} building sprites${DRY ? " [DRY]" : ""}`);
let ok = 0, fail = 0;
for (const [typeKey, variantId, desc] of BUILDINGS) {
  process.stdout.write(`\n[${typeKey}] ${desc.slice(0, 40)}… `);
  if (DRY) { console.log("(dry)"); continue; }
  try {
    const raw = await generateObjectSpriteBytes(desc, OPENAI, "building");
    if (!raw) throw new Error("gen returned null");
    const png = await fit(raw);
    const url = await uploadObjectSprite(sb, png, "curated");
    if (!url) throw new Error("upload failed");
    const { error: vErr } = await sb.from("object_variants").update({ sprite_url: url }).eq("id", variantId);
    if (vErr) throw new Error(`variant update: ${vErr.message}`);
    await sb.from("object_types").update({ gen_description: desc }).eq("type_key", typeKey);
    console.log(`ok (${Math.round(png.length / 1024)}KB)`);
    ok++;
  } catch (e) {
    console.log(`FAIL: ${e instanceof Error ? e.message : e}`);
    fail++;
  }
}
console.log(`\nDone. ${ok} ok, ${fail} failed.`);
