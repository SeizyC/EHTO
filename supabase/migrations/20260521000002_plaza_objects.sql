-- Per-world plaza furniture / props.
--
-- Until now the plaza was rendered from a hardcoded PRESETS.empty in
-- lib/plaza-objects.ts — every world looked identical and never
-- accumulated. This table moves placements into the DB so:
--   · each world's plaza can grow over time (Director-driven additions)
--   · objects survive reloads and stay consistent across sessions
--   · Realtime can push new placements live (no plaza refresh needed)
--
-- The catalog (object KINDS — fountain/bench/planter/lamp/tree) stays
-- in code (OBJECT_CATALOG); only the placements live in the DB.

create table if not exists public.plaza_objects (
  id           uuid primary key default gen_random_uuid(),
  world_id     uuid not null references public.worlds(id) on delete cascade,
  type         text not null,                          -- fountain | bench | planter | lamp | tree
  x            real not null,                          -- 0..100 (% of plaza width, anchor=bottom-center)
  y            real not null,                          -- 0..100 (% of plaza height, anchor=bottom-center)
  scale        real not null default 1.0,
  placed_at    timestamptz not null default now()
);

create index if not exists plaza_objects_world_idx
  on public.plaza_objects(world_id);

alter table public.plaza_objects enable row level security;

-- Only the world owner can see their plaza's objects (mirrors the
-- messages/members RLS pattern; visitor visibility comes later).
create policy "plaza_objects: owner read"
  on public.plaza_objects for select
  using (
    exists (select 1 from public.worlds w
            where w.id = plaza_objects.world_id
              and w.owner_id = auth.uid())
  );
-- All writes go through service role (Director seed + grow), never the
-- client directly — no insert/update/delete policy needed for users.

-- Realtime: stream live placements to the plaza so a Director-added
-- object appears without a page reload. REPLICA IDENTITY FULL so a
-- DELETE event still carries world_id for client-side filtering.
alter publication supabase_realtime add table public.plaza_objects;
alter table public.plaza_objects replica identity full;
