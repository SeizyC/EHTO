-- Canonical per-locale display names for AI characters.
--
-- Until now a member seeded into a non-Korean plaza got a freshly INVENTED
-- name per instance (localizeIdentity), so the same character (same sprite)
-- showed up under different names across plazas — visibly inconsistent when
-- browsing public plazas. name_i18n stores a fixed {ko,en,ja} name set per
-- character so the same sprite reads as the same person within a language.
-- Populated from MEMBER_TEMPLATES via ensureAiPool; speech_style/backstory
-- stay localized per-instance.

alter table public.ai_characters
  add column if not exists name_i18n jsonb;
