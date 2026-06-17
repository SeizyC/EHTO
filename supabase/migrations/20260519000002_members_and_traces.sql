-- Members + cross-world memory traces (V1 foundation).
-- Per the simplified model:
--   · members live in worlds via current_location_world_id
--   · origin_world_id is system lore (not exposed to UI)
--   · no formal home / transfer / request — presence is everything
--   · activity_weight drives Director-orchestrated rotation
--   · memory_traces let members carry vibes from other worlds (Phase 2+)

create table if not exists public.members (
  id                          uuid primary key default gen_random_uuid(),
  origin_world_id             uuid not null references public.worlds(id) on delete cascade,
  current_location_world_id   uuid not null references public.worlds(id) on delete cascade,
  name                        text not null,
  persona                     jsonb not null default '{}'::jsonb,    -- style, affinity tags, speech traits
  backstory                   text,                                    -- multi-sentence lore
  -- rotation
  activity_weight             real not null default 0.5,               -- 0..1, drives speaker selection
  status                      text not null default 'active',           -- active | fading | ghost | away
  status_started_at           timestamptz,
  last_seen_at                timestamptz,
  -- bookkeeping
  referenced_count            int not null default 0,                  -- how often other members mention them
  created_at                  timestamptz not null default now()
);

create index if not exists members_current_location_idx
  on public.members(current_location_world_id);
create index if not exists members_origin_idx
  on public.members(origin_world_id);

alter table public.members enable row level security;

-- World owner sees their world's residents AND any visitors currently present.
create policy "members: visible at current location"
  on public.members for select
  using (
    exists (select 1 from public.worlds w
            where w.id = members.current_location_world_id
              and w.owner_id = auth.uid())
  );

-- System-only insert/update via service role (no direct user write).
-- Owner cannot directly mutate members (no decoration/manipulation).

-- ─────────────────────────────────────────────────────
-- member_memory_traces — what a member carries from elsewhere
-- ─────────────────────────────────────────────────────
create table if not exists public.member_memory_traces (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members(id) on delete cascade,
  source_world_id    uuid not null references public.worlds(id) on delete cascade,
  trace_kind         text not null check (trace_kind in ('theme','event','joke','persona_shift')),
  trace_data         jsonb not null,
  strength           real not null default 1.0,                       -- decays with time
  acquired_at        timestamptz not null default now(),
  last_referenced_at timestamptz
);

create index if not exists traces_member_idx on public.member_memory_traces(member_id);
create index if not exists traces_source_world_idx on public.member_memory_traces(source_world_id);

alter table public.member_memory_traces enable row level security;

-- Owner sees their world members' traces (still hidden from UI; this is for
-- server-side agents that run with user JWT, e.g. Tier 1 enrichment).
create policy "traces: visible via member"
  on public.member_memory_traces for select
  using (
    exists (
      select 1 from public.members m
       join public.worlds w on w.id = m.current_location_world_id
       where m.id = member_memory_traces.member_id
         and w.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────
-- presence — append-only log of "who was where, when"
-- ─────────────────────────────────────────────────────
-- A member has at most one open presence (ended_at IS NULL) at any time.
-- Visit / stay / leave all become rows here.
create table if not exists public.presence (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  world_id     uuid not null references public.worlds(id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  message_count int not null default 0
);

create index if not exists presence_member_open_idx
  on public.presence(member_id) where ended_at is null;
create index if not exists presence_world_recent_idx
  on public.presence(world_id, started_at desc);

alter table public.presence enable row level security;
create policy "presence: world owner read"
  on public.presence for select
  using (
    exists (select 1 from public.worlds w
            where w.id = presence.world_id and w.owner_id = auth.uid())
  );
