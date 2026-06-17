-- World naming + gradual member activation.
--
-- · worlds.name: user-set room name (e.g., "새벽 광장", "비 오는 카페")
-- · members.activated_at: null = dormant, not yet appeared. set when revealed.
-- · members.activation_priority: lower number = activates earlier. computed
--   at seed time based on chemistry with user's character.

alter table public.worlds
  add column if not exists name text;

alter table public.members
  add column if not exists activated_at timestamptz,
  add column if not exists activation_priority int not null default 100;

create index if not exists members_dormant_idx
  on public.members(current_location_world_id, activation_priority)
  where activated_at is null;

-- Name change history — append-only, visible to world owner.
create table if not exists public.world_name_history (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds(id) on delete cascade,
  name       text not null,
  set_at     timestamptz not null default now()
);

create index if not exists wnh_world_idx
  on public.world_name_history(world_id, set_at desc);

alter table public.world_name_history enable row level security;
create policy "wnh: owner read"
  on public.world_name_history for select
  using (
    exists (select 1 from public.worlds w
            where w.id = world_name_history.world_id
              and w.owner_id = auth.uid())
  );
create policy "wnh: owner insert"
  on public.world_name_history for insert
  with check (
    exists (select 1 from public.worlds w
            where w.id = world_name_history.world_id
              and w.owner_id = auth.uid())
  );

-- Auto-log on world name change
create or replace function public.log_world_name()
returns trigger language plpgsql security definer as $$
begin
  if new.name is not null and (old.name is distinct from new.name) then
    insert into public.world_name_history (world_id, name) values (new.id, new.name);
  end if;
  return new;
end $$;

drop trigger if exists worlds_name_log on public.worlds;
create trigger worlds_name_log
  after insert or update of name on public.worlds
  for each row execute function public.log_world_name();

