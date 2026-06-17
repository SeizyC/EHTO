-- Object catalog DB-ification + dynamic generation infrastructure.
-- Spec: docs/superpowers/specs/2026-05-31-dynamic-object-generation-design.md
--
-- Existing 9 static sprite types live in code (lib/plaza-objects.ts).
-- After this migration they get bootstrap'd into object_types as
-- origin='static' with one variant each. Dynamic generation adds new
-- types (origin='dynamic') keyed by (origin_topic, origin_desc_key).

-- ─────────────────────────────────────────────────────
-- object_types — logical kind, shared globally across plazas.
-- ─────────────────────────────────────────────────────
create table if not exists public.object_types (
  id                uuid primary key default gen_random_uuid(),
  type_key          text unique not null,        -- 'lamp', 'gaming_chair', 'dyn_a1b2c3…'
  label_ko          text not null,
  native_height_pct real not null,
  topics            text[] not null default '{}',
  origin            text not null check (origin in ('static', 'dynamic')),
  origin_topic      text,                        -- dynamic 만
  origin_desc_key   text,                        -- dynamic 만 (sha256 prefix)
  usage_count       int not null default 0,
  created_at        timestamptz not null default now(),
  -- Two static rows can't collide on (NULL, NULL); two dynamics with
  -- the same (topic, desc_key) hit the unique → catalog dedup.
  unique (origin_topic, origin_desc_key)
);

create index if not exists object_types_origin_idx
  on public.object_types(origin);
create index if not exists object_types_topics_idx
  on public.object_types using gin (topics);

alter table public.object_types enable row level security;
-- Catalog is read-only public — every authed user sees what's available.
-- Writes go through service role (bootstrap + dynamic-gen pipeline).
create policy "object_types: public read"
  on public.object_types for select using (true);

-- ─────────────────────────────────────────────────────
-- object_variants — visual variations within a type.
-- ─────────────────────────────────────────────────────
-- variant_idx is 1-based, monotonic. variant CAP = 5 (enforced in
-- application code, not DB — the spec leaves room to raise it later).
create table if not exists public.object_variants (
  id           uuid primary key default gen_random_uuid(),
  type_id      uuid not null references public.object_types(id) on delete cascade,
  variant_idx  int  not null,
  sprite_url   text not null,
  created_at   timestamptz not null default now(),
  unique (type_id, variant_idx)
);

create index if not exists object_variants_type_idx
  on public.object_variants(type_id);

alter table public.object_variants enable row level security;
create policy "object_variants: public read"
  on public.object_variants for select using (true);

-- ─────────────────────────────────────────────────────
-- user_object_mutes — per-(user, world, type) "안 어울려"
-- ─────────────────────────────────────────────────────
-- Only dynamic (or future user-added) types are dismissable through
-- the RoomInfoSheet UI — the static set is the baseline plaza and is
-- considered protected. Enforcement lives in the UI / mute endpoint.
create table if not exists public.user_object_mutes (
  user_id   uuid not null references auth.users(id) on delete cascade,
  world_id  uuid not null references public.worlds(id) on delete cascade,
  type_id   uuid not null references public.object_types(id) on delete cascade,
  muted_at  timestamptz not null default now(),
  primary key (user_id, world_id, type_id)
);

alter table public.user_object_mutes enable row level security;

create policy "user_object_mutes: owner read"
  on public.user_object_mutes for select using (auth.uid() = user_id);
create policy "user_object_mutes: owner insert"
  on public.user_object_mutes for insert with check (auth.uid() = user_id);
create policy "user_object_mutes: owner delete"
  on public.user_object_mutes for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- worlds.last_dynamic_gen_at — per-world daily quota
-- ─────────────────────────────────────────────────────
alter table public.worlds
  add column if not exists last_dynamic_gen_at timestamptz;

-- ─────────────────────────────────────────────────────
-- plaza_objects.variant_id — Phase 1 dual-write
-- ─────────────────────────────────────────────────────
-- Existing `type text` column stays for backward compatibility
-- (live rows + the realtime channel readers). The bootstrap script
-- backfills variant_id for existing rows. New inserts (plaza-grow)
-- write both columns until a follow-up migration drops `type`.
alter table public.plaza_objects
  add column if not exists variant_id uuid
    references public.object_variants(id) on delete set null;

create index if not exists plaza_objects_variant_idx
  on public.plaza_objects(variant_id);

-- ─────────────────────────────────────────────────────
-- Atomic usage_count increment helper (RPC)
-- ─────────────────────────────────────────────────────
-- plaza-grow calls this after each placement. SQL function so the
-- update is single-statement / lock-free at the row level.
create or replace function public.increment_type_usage(p_type_id uuid)
returns void language sql as $$
  update public.object_types
     set usage_count = usage_count + 1
   where id = p_type_id;
$$;
