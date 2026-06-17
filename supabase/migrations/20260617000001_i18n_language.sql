-- i18n v1: per-user and per-plaza language.
-- profiles.language: null = "not chosen" (fall back to IP detection).
-- worlds.language: single source of truth for all generation in that plaza.
alter table profiles add column if not exists language text;
alter table worlds  add column if not exists language text not null default 'ko';

-- Guard rails: only the three supported locales.
alter table profiles drop constraint if exists profiles_language_chk;
alter table profiles add constraint profiles_language_chk
  check (language is null or language in ('ko','en','ja'));
alter table worlds drop constraint if exists worlds_language_chk;
alter table worlds add constraint worlds_language_chk
  check (language in ('ko','en','ja'));
