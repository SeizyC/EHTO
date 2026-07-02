-- Locale-aware identity: separate REGION (where friends live) from LANGUAGE.
--
-- language (existing, ko/en/ja) = the language the plaza speaks.
-- region (new, KR/US/JP/GLOBAL) = the cultural life-context of the friends.
--   e.g. "US access + Korean language" → Korean speech, US life ("went to Target...").
-- timezone (new) = IANA tz for time-of-day judgement, so a US plaza's
--   "late night / afternoon" follows US local time, not KST.
--
-- Character profiles (age/home/job/routine/hangout/hook/ties) are stored inside
-- ai_characters.base_persona.profile (jsonb) — no schema column needed for them.
-- Only region gets its own column so seeding can filter the pool efficiently.
--
-- Idempotent: safe to re-run. Existing rows default to KR / Asia/Seoul, i.e.
-- current behaviour is preserved exactly.

alter table public.worlds
  add column if not exists region   text not null default 'KR';
alter table public.worlds
  add column if not exists timezone text not null default 'Asia/Seoul';

alter table public.worlds drop constraint if exists worlds_region_chk;
alter table public.worlds add constraint worlds_region_chk
  check (region in ('KR','US','JP','GLOBAL'));

alter table public.ai_characters
  add column if not exists region text not null default 'KR';

alter table public.ai_characters drop constraint if exists ai_characters_region_chk;
alter table public.ai_characters add constraint ai_characters_region_chk
  check (region in ('KR','US','JP','GLOBAL'));

create index if not exists ai_characters_region_idx
  on public.ai_characters(region);
