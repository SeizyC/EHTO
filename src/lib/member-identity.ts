import { chatComplete, FILLER_CHAT_MODEL } from "@/lib/claude";
import type { Locale } from "@/lib/language";
import { LANGUAGE_NAMES } from "@/lib/language";

export type NeutralArchetype = {
  affinity: string[];        // neutral-ish slugs reused across languages
  speechSeed: string;        // short english concept of voice, e.g. "quiet, short sentences, shares music"
  backstorySeed: string;     // short english concept, e.g. "often up late, hunts indie music"
};

export type LocalizedIdentity = { name: string; speech_style: string; backstory: string };

// Generate a culturally-appropriate identity in the plaza language.
// ko returns null (caller keeps the existing native Korean pool fields) to avoid extra cost.
export async function localizeIdentity(
  arch: NeutralArchetype,
  language: Locale,
): Promise<LocalizedIdentity | null> {
  if (language === "ko") return null;
  const sys = `You invent a single believable ${LANGUAGE_NAMES[language]}-speaking person for a small social plaza. Output STRICT JSON only: {"name": string, "speech_style": string, "backstory": string}. The name must be a natural ${LANGUAGE_NAMES[language]} given-name or handle. speech_style and backstory must be written in ${LANGUAGE_NAMES[language]}, one short phrase each.`;
  const user = `Interests: ${arch.affinity.join(", ")}. Voice: ${arch.speechSeed}. Background: ${arch.backstorySeed}.`;
  const raw = await chatComplete({ system: sys, user, maxTokens: 200, model: FILLER_CHAT_MODEL });
  if (!raw) return null;
  try {
    const j = JSON.parse(raw.trim().replace(/^```json/i, "").replace(/```$/,"").trim());
    if (typeof j.name === "string" && typeof j.speech_style === "string" && typeof j.backstory === "string") {
      return {
        name: j.name.slice(0, 40),
        speech_style: j.speech_style.slice(0, 120),
        backstory: j.backstory.slice(0, 240),
      };
    }
  } catch { /* fall through */ }
  return null;
}
