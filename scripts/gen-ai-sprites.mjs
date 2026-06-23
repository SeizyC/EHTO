// Batch-generate persona sprites for ai_characters still on a placeholder
// hero sprite (/sprites/hero/test_*.png). Mirrors the per-character admin
// route (src/app/api/admin/ai-characters/[id]/sprite/route.ts): gpt-image-1
// (transparent bg) → upload to the `characters` bucket → update
// ai_characters.sprite → propagate the URL to every linked members row.
//
//   node --env-file=.env.local scripts/gen-ai-sprites.mjs [--limit N] [--all] [--dry]
//
// --limit N : only process the first N placeholder characters (default: all)
// --all     : also regenerate characters that already have a generated sprite
// --dry     : list what would be generated, make no API calls / writes
//
// Uses the SAME CF AI Gateway → OpenAI images path as the app, so cost and
// output match the admin button. The prompt builder is imported straight
// from the app source (it's dependency-free).

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildAiSpritePrompt } from "../src/lib/ai-sprite-prompt.ts";
import { IMAGES_GENERATIONS_URL } from "../src/lib/openai-urls.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ALL = args.includes("--all");
const limIdx = args.indexOf("--limit");
const LIMIT = limIdx !== -1 ? parseInt(args[limIdx + 1], 10) : Infinity;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI = process.env.OPENAI_API_KEY;
if (!URL || !SERVICE) { console.error("missing supabase env"); process.exit(1); }
if (!DRY && !OPENAI) { console.error("missing OPENAI_API_KEY"); process.exit(1); }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const publicSpriteUrl = (path) => `${URL}/storage/v1/object/public/characters/${path}`;

const MODEL = "gpt-image-1";
const ATTEMPT_TIMEOUT_MS = 120_000;

async function genImage(prompt) {
  const resp = await fetch(IMAGES_GENERATIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size: "1024x1024", quality: "high", background: "transparent" }),
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });
  const j = await resp.json().catch(() => null);
  if (resp.ok && j?.data?.[0]?.b64_json) return Buffer.from(j.data[0].b64_json, "base64");
  throw new Error(j?.error?.message ?? `HTTP ${resp.status} ${resp.statusText}`);
}

async function main() {
  const filter = ALL ? "*" : "/sprites/hero/test_%";
  let query = svc
    .from("ai_characters")
    .select("id, name, base_persona, base_backstory, sprite")
    .order("created_at", { ascending: true });
  if (!ALL) query = query.like("sprite", "/sprites/hero/test_%");
  const { data: chars, error } = await query;
  if (error) { console.error("read error:", error.message); process.exit(1); }

  const targets = (chars ?? []).slice(0, LIMIT);
  console.log(`Targets: ${targets.length}${ALL ? " (--all)" : " on placeholder sprites"}${DRY ? " [DRY RUN]" : ""}`);
  for (const c of targets) console.log(`  · ${c.name}  ←  ${c.sprite}`);
  if (DRY || targets.length === 0) return;

  let ok = 0, fail = 0;
  for (const c of targets) {
    const persona = c.base_persona ?? {};
    const prompt = buildAiSpritePrompt({
      name: c.name,
      affinity: persona.affinity ?? [],
      speech_style: persona.speech_style ?? null,
      backstory: c.base_backstory,
    });
    process.stdout.write(`\n[${c.name}] generating… `);
    try {
      const png = await genImage(prompt);
      const filename = `ai/${c.id}/${randomUUID()}.png`;
      const { error: upErr } = await svc.storage
        .from("characters")
        .upload(filename, png, { contentType: "image/png", upsert: false });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const url = publicSpriteUrl(filename);
      const { error: updErr } = await svc.from("ai_characters").update({ sprite: url }).eq("id", c.id);
      if (updErr) throw new Error(`db: ${updErr.message}`);
      // Propagate to linked members so already-seeded plazas pick it up.
      const { data: linked } = await svc.from("members").select("id, persona").eq("ai_character_id", c.id);
      let synced = 0;
      for (const m of linked ?? []) {
        const { error: mErr } = await svc.from("members").update({ persona: { ...(m.persona ?? {}), sprite: url } }).eq("id", m.id);
        if (!mErr) synced++;
      }
      console.log(`ok (${Math.round(png.length / 1024)}KB, synced ${synced} member${synced === 1 ? "" : "s"})`);
      ok++;
    } catch (e) {
      console.log(`FAIL: ${e instanceof Error ? e.message : e}`);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
