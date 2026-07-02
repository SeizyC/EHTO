// One-off backfill: give existing ai_characters + members the new region +
// latent profile (age/home/job/routine/hangout/hook/ties).
//
//   node --env-file=.env.local --import tsx scripts/backfill-profiles.ts
//
// Idempotent: re-running only fills what's missing / refreshes from templates.
// 1) ensureAiPool upserts region + base_persona.profile onto ai_characters.
// 2) Each member inherits its ai_character's region + profile into
//    members.persona (matched by ai_character_id; legacy rows by name).

import { serviceClient } from "@/lib/supabase";
import { ensureAiPool } from "@/lib/ai-pool";
import { MEMBER_TEMPLATES, NAME_I18N } from "@/lib/member-templates";

async function main() {
const sb = serviceClient();

// 1) Refresh the global pool so every ai_character carries region + profile.
await ensureAiPool(sb);
console.log("ensureAiPool done");

// Map template name → {region, profile} and every locale display name → template.
const byName = new Map<string, { region: string; profile: unknown }>();
// Affinity signature → template. Legacy characters (older human-name pool:
// 준=drip.k, 강이=야근파, …) share the exact affinity array of a current
// template, so we can transplant that template's region+profile onto them.
const bySig = new Map<string, { region: string; profile: unknown }>();
const sigOf = (aff: string[] | undefined) => [...(aff ?? [])].sort().join("|");
for (const t of MEMBER_TEMPLATES) {
  const val = { region: t.region, profile: t.profile };
  byName.set(t.name, val);
  const i18n = NAME_I18N[t.name];
  if (i18n) { byName.set(i18n.en, val); byName.set(i18n.ja, val); }
  if (!bySig.has(sigOf(t.affinity))) bySig.set(sigOf(t.affinity), val);
}

// Fill region+profile onto any ai_character missing a profile (the legacy
// pool), matched by affinity signature. Do this BEFORE reading chars for
// member inheritance so members pick up the freshly-filled profiles.
{
  const { data: allChars } = await sb
    .from("ai_characters")
    .select("id, name, region, base_persona");
  let filled = 0, unmatchedChars = 0;
  for (const c of allChars ?? []) {
    const bp = (c.base_persona as { affinity?: string[]; profile?: unknown }) ?? {};
    if (bp.profile != null) continue; // already has one (template)
    const match = bySig.get(sigOf(bp.affinity));
    if (!match) { unmatchedChars++; console.warn(`no template match for legacy char: ${c.name}`); continue; }
    const nextBp = { ...bp, profile: match.profile };
    const { error } = await sb
      .from("ai_characters")
      .update({ base_persona: nextBp, region: match.region })
      .eq("id", c.id);
    if (error) { console.warn(`char ${c.name} update failed: ${error.message}`); continue; }
    filled++;
  }
  console.log(`legacy ai_characters filled: ${filled}, unmatched: ${unmatchedChars}`);
}

// Pull the authoritative region/profile from ai_characters (source of truth).
const { data: chars, error: cErr } = await sb
  .from("ai_characters")
  .select("id, name, region, base_persona");
if (cErr) throw new Error(`ai_characters read: ${cErr.message}`);
const byCharId = new Map<string, { region: string; profile: unknown }>();
for (const c of chars ?? []) {
  const profile = (c.base_persona as { profile?: unknown } | null)?.profile ?? null;
  byCharId.set(c.id, { region: (c.region as string) ?? "KR", profile });
}

// 2) Backfill members.
const { data: members, error: mErr } = await sb
  .from("members")
  .select("id, name, ai_character_id, persona");
if (mErr) throw new Error(`members read: ${mErr.message}`);

let updated = 0, skipped = 0, unmatched = 0;
for (const m of members ?? []) {
  const persona = (m.persona as Record<string, unknown>) ?? {};
  // Resolve region + profile: prefer the linked ai_character, else name match.
  let src = m.ai_character_id ? byCharId.get(m.ai_character_id as string) : undefined;
  if (!src) src = byName.get(m.name as string);
  if (!src) { unmatched++; continue; }

  // Only write if something is missing (idempotent).
  const hasProfile = persona.profile != null;
  const hasRegion = persona.region != null;
  if (hasProfile && hasRegion) { skipped++; continue; }

  const next = { ...persona, profile: src.profile ?? persona.profile ?? null, region: src.region };
  const { error } = await sb.from("members").update({ persona: next }).eq("id", m.id);
  if (error) { console.warn(`member ${m.id} update failed: ${error.message}`); continue; }
  updated++;
}

console.log(JSON.stringify({ members: members?.length ?? 0, updated, skipped, unmatched }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
