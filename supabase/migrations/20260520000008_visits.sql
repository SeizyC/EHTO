-- Unified visit log — every "showing up" event by either the room owner
-- (user) or an AI member is recorded here. Used to derive the visit
-- stats shown in RoomInfoSheet (today / week / cumulative).
--
-- One row = one visit session. Multiple opens by the same owner within
-- a 30-minute window collapse into a single row (deduped server-side).
-- Each AI activation (initial or after rotation refill) yields a row.

create table if not exists public.visits (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references public.worlds(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  member_id   uuid references public.members(id) on delete cascade,
  started_at  timestamptz not null default now(),
  constraint visits_one_source check (
    (user_id is not null and member_id is null)
    or (user_id is null and member_id is not null)
  )
);

create index if not exists visits_world_started_idx
  on public.visits(world_id, started_at desc);

alter table public.visits enable row level security;

-- World owner can read all visits to their world (user + member sources).
create policy "visits: owner read"
  on public.visits for select
  using (
    exists (select 1 from public.worlds w
            where w.id = visits.world_id
              and w.owner_id = auth.uid())
  );
-- Inserts happen via service role only — no user-side policy.
