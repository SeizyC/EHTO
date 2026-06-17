// One-shot batch: regenerate every ai_character still on the legacy
// /sprites/hero/test_NN.png placeholder. Mirrors the production admin
// endpoint logic (gpt-image-1 → chroma → Supabase storage → DB update
// + members.persona.sprite propagation) but driven sequentially from
// the CLI so failures are visible and recoverable.
//
// Usage: set -a; . .env.local; set +a; node scripts/regen-legacy-sprites.mjs
//
// Cost per character ≈ $0.03 (gpt-image-1 high). Sequential, ~30s each
// → ~8–9 minutes for 17 characters.

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!URL || !SERVICE || !OPENAI_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY");
  process.exit(2);
}
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

const ROOT = process.cwd();
const CHROMA = path.join(ROOT, "sprite-gen", "chroma.py");

const MODEL = "gpt-image-1";
const SIZE = "1024x1024";
const QUALITY = "high";
const TIMEOUT_MS = 120_000;

// ── prompt builder (mirrors lib/ai-sprite-prompt.ts) ─────────────────
const SKIN_TONES = [
  "fair pale skin", "warm beige skin", "olive skin tone",
  "warm tan skin", "deep brown skin",
];
const GENDER_HINTS = [
  "androgynous looking person, gender-neutral features",
  "masculine looking person",
  "feminine looking person",
];
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
function outfitFromPersona(aff) {
  const has = (...ks) => ks.some((k) => aff.includes(k));
  if (has("sports","energy","운동","주말")) return "athletic athleisure: fitted tee, joggers, running sneakers";
  if (has("tech","링크 공유","호기심")) return "minimalist tech outfit: plain crewneck and dark slim pants, sneakers";
  if (has("book","책","독서","사색","심야")) return "layered indie outfit: open cardigan over plain tee, loose pants, soft shoes";
  if (has("food","cozy","위안","주말")) return "cozy loungewear: oversized knit sweater, soft pants, slip-on shoes";
  if (has("chaotic","밈","playful","농담")) return "streetwear: graphic hoodie, baggy cargo pants, chunky sneakers";
  if (has("minimal","심플","calm","철학")) return "minimalist outfit: monochrome top and pants, neutral palette, clean sneakers";
  if (has("새벽","음악","indie","정서","우울")) return "moody outfit: dark hoodie or jacket, slim pants, simple sneakers";
  if (has("따뜻","공감","케어")) return "soft outfit: pastel cardigan or sweatshirt, comfortable pants";
  if (has("work","야근","출근","피로")) return "smart casual: button-up shirt and chinos, loafers";
  return "casual everyday outfit: simple t-shirt and jeans, sneakers";
}
function hairFromPersona(aff) {
  const has = (...ks) => ks.some((k) => aff.includes(k));
  if (has("sports","energy","운동")) return "short cropped natural-brown hair";
  if (has("chaotic","밈","playful")) return "messy medium hair, slightly tousled";
  if (has("minimal","심플","calm")) return "neat short black hair";
  if (has("새벽","심야","indie","우울")) return "medium dark hair, soft fringe over forehead";
  if (has("따뜻","공감","케어")) return "shoulder-length wavy warm-brown hair";
  if (has("책","독서","사색")) return "medium length neat dark hair";
  return "medium length natural hair";
}
function genderFor(name, h) {
  if (/(아|연|채|민|지호)/.test(name)) return GENDER_HINTS[2];
  if (/(준|도현|강이|노아|haru)/.test(name)) return GENDER_HINTS[1];
  return GENDER_HINTS[h % 3];
}
function buildPrompt(ch) {
  const aff = (ch.base_persona?.affinity ?? []).map((a) => String(a).toLowerCase());
  const h = fnv1a(ch.name);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const gender = genderFor(ch.name, h);
  return [
    "A pixel art character sprite, modern social-app style, 3/4 front isometric view,",
    "standing idle pose on flat ground,",
    "head about 1/3 of total height — large enough that the face is clearly readable at small sizes,",
    `clearly visible front-facing face with recognizable features (two distinct eyes, nose, mouth), ${skin},`,
    `${gender}, ${hairFromPersona(aff)},`,
    `${outfitFromPersona(aff)},`,
    "no accessories on face,",
    "limited color palette 8-10 colors, soft 1px outline, no anti-aliasing,",
    "centered on a solid flat green #00FF00 chroma background,",
    "full body visible from head to feet, no shadow, no environment,",
    "pixel-perfect clean lines, retro pixel game aesthetic but contemporary urban not fantasy,",
    "the character occupies the center 70% of the frame,",
    "face must be readable — do NOT obscure with hat brim, hood, hair covering eyes, or facing away,",
    "not faceless, not anime chibi, not big head chibi, not fantasy RPG, no animal features, no weapons, contemporary social character",
  ].join(" ");
}

// ── helpers ──────────────────────────────────────────────────────────
function chromaKey(png) {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [CHROMA]);
    const out = []; const err = [];
    proc.stdout.on("data", (c) => out.push(c));
    proc.stderr.on("data", (c) => err.push(c));
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`chroma exit ${code}: ${Buffer.concat(err).toString()}`));
    });
    proc.stdin.end(png);
  });
}
async function callOpenAI(prompt) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size: SIZE, quality: QUALITY }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await r.json().catch(() => null);
  if (r.ok && j?.data?.[0]?.b64_json) return Buffer.from(j.data[0].b64_json, "base64");
  throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
}
function publicSpriteUrl(filename) {
  return `${URL}/storage/v1/object/public/characters/${filename}`;
}

// ── main loop ────────────────────────────────────────────────────────
const { data: chars, error } = await sb
  .from("ai_characters")
  .select("id, name, base_persona, base_backstory, sprite")
  .like("sprite", "/sprites/hero/test_%")
  .order("name");
if (error) { console.error("query failed:", error.message); process.exit(2); }
console.log(`found ${chars.length} legacy characters to regenerate\n`);

const startedAt = Date.now();
let ok = 0, fail = 0;
for (let i = 0; i < chars.length; i++) {
  const c = chars[i];
  const tag = `[${i + 1}/${chars.length}] ${c.name}`;
  process.stdout.write(`${tag} ... `);
  const t0 = Date.now();
  try {
    const prompt = buildPrompt(c);
    const raw = await callOpenAI(prompt);
    let processed;
    try { processed = await chromaKey(raw); }
    catch (e) {
      process.stdout.write(`(chroma skip: ${e.message.slice(0, 40)}) `);
      processed = raw;
    }
    const filename = `ai/${c.id}/${randomUUID()}.png`;
    const { error: upErr } = await sb.storage
      .from("characters")
      .upload(filename, processed, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    const url = publicSpriteUrl(filename);
    const { error: updErr } = await sb.from("ai_characters").update({ sprite: url }).eq("id", c.id);
    if (updErr) throw new Error(`db: ${updErr.message}`);

    // Sync linked members.
    const { data: linked } = await sb.from("members").select("id, persona").eq("ai_character_id", c.id);
    let synced = 0;
    for (const m of linked ?? []) {
      const np = { ...(m.persona ?? {}), sprite: url };
      const { error: mErr } = await sb.from("members").update({ persona: np }).eq("id", m.id);
      if (!mErr) synced++;
    }

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`ok (${dt}s, synced ${synced} member${synced === 1 ? "" : "s"})`);
    ok++;
  } catch (e) {
    console.log(`FAIL: ${e.message?.slice(0, 200)}`);
    fail++;
  }
}
const total = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\ndone. ok=${ok}, fail=${fail}, total ${total}s`);
process.exit(fail > 0 ? 1 : 0);
