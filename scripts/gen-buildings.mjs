#!/usr/bin/env node
// Author isometric building sprites as SVG and rasterize to PNG via sharp.
// Claude-made vector art (no image-gen API) → /public/sprites/rooms/objects.
// Run: node scripts/gen-buildings.mjs

import sharp from "sharp";

const OUT = "public/sprites/rooms/objects";

// A simple cozy storefront facade with an iso box body.
function shop({ wall, side, roof, awning, sign }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 240 300">
<g stroke="#3a2e22" stroke-width="2" stroke-linejoin="round">
  <polygon points="40,100 80,78 200,78 160,100" fill="${roof}"/>
  <polygon points="160,100 200,78 200,266 160,285" fill="${side}"/>
  <polygon points="40,100 160,100 160,285 40,285" fill="${wall}"/>
  <rect x="46" y="108" width="108" height="26" rx="2" fill="${sign}"/>
  <g stroke="none">
    <polygon points="44,150 156,150 150,170 50,170" fill="${awning}"/>
    <polygon points="60,150 72,150 66,170 54,170" fill="#f0e6cf"/>
    <polygon points="88,150 100,150 94,170 82,170" fill="#f0e6cf"/>
    <polygon points="116,150 128,150 122,170 110,170" fill="#f0e6cf"/>
  </g>
  <rect x="58" y="182" width="84" height="56" rx="2" fill="#34605a"/>
  <rect x="58" y="182" width="84" height="56" rx="2" fill="none" stroke="#4a3b2e" stroke-width="3"/>
  <line x1="100" y1="182" x2="100" y2="238" stroke="#4a3b2e" stroke-width="3"/>
  <rect x="100" y="244" width="44" height="41" fill="#6b4a32"/>
  <circle cx="106" cy="266" r="2.5" fill="#d9b25e" stroke="none"/>
</g>
</svg>`;
}

const VARIANTS = [
  { name: "building_shop", wall: "#e8d4ae", side: "#c9a87f", roof: "#b5654a", awning: "#6fae9f", sign: "#7a5a3e" },
  { name: "building_cafe", wall: "#e3ddd0", side: "#c4bda9", roof: "#7d9a86", awning: "#c97f6a", sign: "#5e6b58" },
];

for (const v of VARIANTS) {
  await sharp(Buffer.from(shop(v))).png().toFile(`${OUT}/${v.name}.png`);
  const m = await sharp(`${OUT}/${v.name}.png`).metadata();
  console.log(`${v.name}.png ${m.width}x${m.height}`);
}
