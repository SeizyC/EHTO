-- Plaza positions (DB-authoritative layout).
--
-- Owner character lives in worlds.owner_x/y/flip. AI members live in
-- members.x/y/flip. Coordinates are percent (0-100) over the plaza
-- canvas. flip = true means the sprite faces left.
--
-- Floor band (mirrors /world page constants): x ∈ [14, 86], y ∈ [42, 80].
-- Defaults seat new entities near the visual center so they're visible
-- even before any drift/click writes a real position.

alter table public.worlds
  add column if not exists owner_x real not null default 50,
  add column if not exists owner_y real not null default 60,
  add column if not exists owner_flip boolean not null default false,
  add column if not exists owner_pos_updated_at timestamptz not null default now();

alter table public.members
  add column if not exists x real not null default 50,
  add column if not exists y real not null default 60,
  add column if not exists flip boolean not null default false,
  add column if not exists pos_updated_at timestamptz not null default now();

-- Owner needs RLS write on the position columns of their own world.
-- worlds RLS already exists for owner select/update on the row; double-
-- check by adding an explicit update policy if not present. The existing
-- migration 20260519000003 grants owner update via a similar policy, so
-- we don't need a new one here — owner_x/y/flip just ride along.

-- Members RLS: today only owners can SELECT their world's members and
-- writes are service-role-only. Position drift runs server-side via
-- ambient-loop using the service client, so no client-write policy is
-- required for members.x/y/flip.
