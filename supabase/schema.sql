-- EHTO — initial schema (V1)
-- Run in Supabase SQL editor (Dashboard → SQL → New Query).
-- Designed for V1: anonymous-or-authenticated character ownership,
-- world is implicit (one per owner), members are dummy until M5.

-- ─────────────────────────────────────────────
-- 1. profiles  (lightweight — extends auth.users)
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: self-read"
  on public.profiles for select using (auth.uid() = id);

create policy "profiles: self-upsert"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles: self-update"
  on public.profiles for update using (auth.uid() = id);

-- ─────────────────────────────────────────────
-- 2. characters  (the user's avatar; one active per user but history kept)
-- ─────────────────────────────────────────────
create table if not exists public.characters (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  is_active   boolean not null default true,
  image_path  text not null,            -- storage path inside the characters bucket
  gender      text not null check (gender in ('m','f')),
  skin        text not null,
  outfit      text not null,
  rolled_hair text,
  prompt      text,
  created_at  timestamptz not null default now()
);

create index if not exists characters_owner_active_idx
  on public.characters(owner_id) where is_active;

alter table public.characters enable row level security;

create policy "characters: owner-read"
  on public.characters for select using (auth.uid() = owner_id);

create policy "characters: owner-insert"
  on public.characters for insert with check (auth.uid() = owner_id);

create policy "characters: owner-update"
  on public.characters for update using (auth.uid() = owner_id);

-- Only one active character per owner at a time.
create or replace function public.deactivate_other_characters()
returns trigger language plpgsql as $$
begin
  if new.is_active then
    update public.characters
       set is_active = false
     where owner_id = new.owner_id
       and id <> new.id
       and is_active;
  end if;
  return new;
end $$;

drop trigger if exists characters_single_active on public.characters;
create trigger characters_single_active
  after insert or update of is_active on public.characters
  for each row execute function public.deactivate_other_characters();

-- ─────────────────────────────────────────────
-- 3. worlds  (one per user in V1; richer model later)
-- ─────────────────────────────────────────────
create table if not exists public.worlds (
  id           uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade unique,
  mood_text   text default '비 오는 새벽',
  mood_data   jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.worlds enable row level security;

create policy "worlds: owner-read"
  on public.worlds for select using (auth.uid() = owner_id);

create policy "worlds: owner-insert"
  on public.worlds for insert with check (auth.uid() = owner_id);

create policy "worlds: owner-update"
  on public.worlds for update using (auth.uid() = owner_id);

-- ─────────────────────────────────────────────
-- 4. storage bucket: characters  (sprite PNGs)
-- ─────────────────────────────────────────────
-- Bucket creation must happen via dashboard or storage API:
--   name: characters
--   public: true   (sprites are not sensitive; URL-shareable saves request overhead)
--   file size limit: 2 MB
--   allowed mime types: image/png
--
-- Storage RLS — owner can upload/update files prefixed with their uid
-- (paths look like:  {auth.uid()}/{character-id}.png)

-- After bucket is created, run these to enable owner-scoped uploads:

-- insert / update under own folder
-- create policy "characters: owner upload"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'characters'
--     and (storage.foldername(name))[1] = auth.uid()::text
--   );
-- create policy "characters: owner update"
--   on storage.objects for update using (
--     bucket_id = 'characters'
--     and (storage.foldername(name))[1] = auth.uid()::text
--   );
-- read is public via bucket setting; no select policy needed.

-- ─────────────────────────────────────────────
-- 5. updated_at trigger helper
-- ─────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists worlds_touch_updated on public.worlds;
create trigger worlds_touch_updated
  before update on public.worlds
  for each row execute function public.touch_updated_at();
