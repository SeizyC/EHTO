// Server-safe language helpers. Re-exports Locale so server modules
// (prompts, news, seeding) don't import the client-leaning about-content.
import { type Locale, countryToLocale, isLocale, DEFAULT_LOCALE } from "@/lib/about-content";

export type { Locale };
export { isLocale, countryToLocale, DEFAULT_LOCALE };

// Human-readable language names for prompt directives ("Write only in X.").
export const LANGUAGE_NAMES: Record<Locale, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
};

// Region/locale codes for Google News RSS (hl + gl + ceid).
export const NEWS_LOCALE: Record<Locale, { hl: string; gl: string }> = {
  ko: { hl: "ko", gl: "KR" },
  en: { hl: "en-US", gl: "US" },
  ja: { hl: "ja", gl: "JP" },
};

// Precedence: explicit saved choice > IP auto-detect > default ("ko").
export function resolveUserLanguage(args: {
  saved?: string | null;
  country?: string | null;
}): Locale {
  if (isLocale(args.saved)) return args.saved;
  return countryToLocale(args.country);
}
