-- AI character pool (Option C: hybrid global-identity model).
--
-- Why:
--   Each ai_characters row is the "원본" persona — a single shared identity
--   that can exist across multiple worlds simultaneously, but only up to
--   `max_concurrent_rooms` at a time.
--   Each members row is the per-world *instance* of that AI: own activation
--   timing, own room-local memory traces, own bubble state.
--
-- Load balancing:
--   When seeding a new world, we pick characters whose current "active room
--   count" (members rows where activated_at not null and status <> 'ghost'
--   for that ai_character_id) is below their cap, ordered by least-loaded.
--   Counting at read time — no trigger-maintained cache column (avoids drift).

create table if not exists public.ai_characters (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  sprite                  text not null,
  base_persona            jsonb not null default '{}'::jsonb,
  base_backstory          text,
  default_activity_weight real not null default 0.5,
  max_concurrent_rooms    int not null default 2,
  created_at              timestamptz not null default now()
);

alter table public.ai_characters enable row level security;

-- Public read: any signed-in user can resolve base persona for any AI in their world.
create policy "ai_characters: public read"
  on public.ai_characters for select using (true);
-- Writes via service role only (no policy = blocked under RLS).

-- Link members → ai_characters. Nullable to keep legacy/test rows intact.
alter table public.members
  add column if not exists ai_character_id uuid
  references public.ai_characters(id) on delete set null;

create index if not exists members_ai_character_idx
  on public.members(ai_character_id);

-- A given AI can have at most one *non-ghost* instance per world at a time.
create unique index if not exists members_ai_per_world_unique
  on public.members(ai_character_id, current_location_world_id)
  where ai_character_id is not null and status <> 'ghost';
