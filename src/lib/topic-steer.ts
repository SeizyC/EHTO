// Explicit in-chat topic steering.
//
// A user can say "책 얘기는 그만하고 자동차 얘기를 하자" — without this, the
// implicit-capture path would run extractTopic, pull the most prominent noun
// ("책"), and add a +1.0 signal — ironically REINFORCING the very topic the
// user is trying to drop. classifySteer reads the steering intent so the
// caller can act on it instead (hard-mute the drop, boost the focus).
//
// One Haiku call per user message, replacing the lone extractTopic call in
// the implicit-capture block of /api/messages. extractTopic is left untouched
// for the ambient / member-relations callers that don't need steering.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "@/lib/claude";
import { type Locale, LANGUAGE_NAMES } from "@/lib/language";

export type SteerResult = {
  /** Plain topic of a normal (non-steering) message. */
  topic: string | null;
  /** A topic the user wants to STOP / hear less of. */
  drop: string | null;
  /** A topic the user wants to talk about NOW / more. */
  focus: string | null;
};

const EMPTY: SteerResult = { topic: null, drop: null, focus: null };

export async function classifySteer(
  text: string,
  language: Locale = "ko",
): Promise<SteerResult> {
  const trimmed = text.trim();
  // Lines under ~6 chars are reactions ("ㅋㅋ", "응") — nothing to extract.
  if (trimmed.length < 6) return EMPTY;

  const langName = LANGUAGE_NAMES[language] ?? "Korean";
  const system = [
    `Analyze ONE line of chat (written in ${langName}) and classify the user's topic intent.`,
    "Return STRICT JSON with exactly these keys and nothing else:",
    `{"topic": <noun or null>, "drop": <noun or null>, "focus": <noun or null>}`,
    "",
    "Definitions:",
    "- drop: a topic the user wants to STOP or hear LESS of (e.g. 'stop talking about books', 'enough about X', 'X is boring', '책 그만', 'X 말고').",
    "- focus: a topic the user wants to talk about NOW or MORE (e.g. \"let's talk about cars\", '자동차 얘기하자', '대신 X', 'X 얘기 좀').",
    "- topic: for a plain statement with NO steering, the single main topic noun (like a keyword extractor). null for greetings/reactions.",
    "",
    "Rules:",
    `- Every non-null value MUST be a single short noun written in ${langName} (1-3 words). No verbs, no sentences.`,
    "- A message can have BOTH drop and focus ('stop X, let's do Y') — set both; topic may be null.",
    "- When the user is just talking about something normally, set only topic.",
    "- Use JSON null (not the string \"null\") for absent fields. Output JSON only, no prose.",
  ].join("\n");

  const raw = await chatComplete({ system, user: trimmed, maxTokens: 80 });
  if (!raw) return EMPTY;
  return parseSteer(raw);
}

/** Defensive parse of the model's JSON. Exported for unit testing. */
export function parseSteer(raw: string): SteerResult {
  // Grab the first {...} block in case the model wraps it in prose.
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return EMPTY;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return EMPTY;
  }
  const norm = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.replace(/^["'`]+|["'`.,;!?]+$/g, "").trim();
    if (!s || s.toLowerCase() === "null" || s.toUpperCase() === "NONE" || s.length > 20) {
      return null;
    }
    return s;
  };
  return { topic: norm(obj.topic), drop: norm(obj.drop), focus: norm(obj.focus) };
}

/** Remove a topic tag from every member's persona.affinity in a world.
 *  Used when the user hard-mutes a topic so members stop leaning on it
 *  from their own baked-in persona (persona-drift only ever appends, so
 *  without this a once-hot topic sticks to members permanently). */
export async function stripAffinityTopic(
  sb: SupabaseClient,
  worldId: string,
  topic: string,
): Promise<void> {
  const { data: members } = await sb
    .from("members")
    .select("id, persona")
    .eq("current_location_world_id", worldId);
  for (const m of (members ?? []) as Array<{ id: string; persona: { affinity?: string[] } | null }>) {
    const aff = m.persona?.affinity ?? [];
    if (!aff.includes(topic)) continue;
    const nextPersona = { ...(m.persona ?? {}), affinity: aff.filter((t) => t !== topic) };
    await sb.from("members").update({ persona: nextPersona }).eq("id", m.id);
  }
}
