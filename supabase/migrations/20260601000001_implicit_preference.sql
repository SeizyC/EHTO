-- Implicit preference learning (2026-05-31 design).
--
-- Two new tables capture the raw signals + the user's mute list. Time
-- decay + aggregation happen at read time in lib/implicit-pref.ts, so
-- the schema stays append-only and cheap to evolve.
--
-- One column on worlds gates the daily persona drift tick.

-- ─────────────────────────────────────────────────────
-- user_signals — append-only stream of user inputs.
-- ─────────────────────────────────────────────────────
-- kind='chat'    : message text → 0..2 topic keywords (Haiku-extracted).
--                  One row per extracted keyword.
-- kind='mention' : message text contained `@<member-name>`. Captures
--                  the user's affinity for that member; topic_keyword
--                  is null for these rows.
create table if not exists public.user_signals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  world_id          uuid not null references public.worlds(id) on delete cascade,
  kind              text not null check (kind in ('chat', 'mention')),
  topic_keyword     text,
  target_member_id  uuid references public.members(id) on delete set null,
  -- chat: 1.0 / mention: 0.8 (current constants; the column leaves
  -- room for new signal kinds later without a migration).
  weight            real not null default 1.0,
  created_at        timestamptz not null default now()
);

create index if not exists user_signals_world_recent_idx
  on public.user_signals(world_id, created_at desc);
create index if not exists user_signals_world_topic_idx
  on public.user_signals(world_id, topic_keyword)
  where topic_keyword is not null;

alter table public.user_signals enable row level security;

-- Owner can read their own signals (transparency panel). Inserts and
-- mutations are service-role-only — no client write path so the model
-- of "user can't fake their own preferences" holds.
create policy "user_signals: owner read"
  on public.user_signals for select
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- user_topic_mutes — permanent "그건 아니야" list.
-- ─────────────────────────────────────────────────────
-- Inserted when the owner taps the X on a keyword in the RoomInfoSheet
-- transparency panel. Aggregate filters muted topics out of the result
-- set so they never reach any of the five application sites again.
create table if not exists public.user_topic_mutes (
  user_id        uuid not null references auth.users(id) on delete cascade,
  world_id       uuid not null references public.worlds(id) on delete cascade,
  topic_keyword  text not null,
  muted_at       timestamptz not null default now(),
  primary key (user_id, world_id, topic_keyword)
);

alter table public.user_topic_mutes enable row level security;

create policy "user_topic_mutes: owner read"
  on public.user_topic_mutes for select
  using (auth.uid() = user_id);

create policy "user_topic_mutes: owner insert"
  on public.user_topic_mutes for insert
  with check (auth.uid() = user_id);

create policy "user_topic_mutes: owner delete"
  on public.user_topic_mutes for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- worlds.last_persona_drift_at — daily gate for application D.
-- ─────────────────────────────────────────────────────
-- The persona-drift tick only fires when this stamp is NULL or older
-- than 24h, so a member's affinity grows at most one entry per day.
alter table public.worlds
  add column if not exists last_persona_drift_at timestamptz;
