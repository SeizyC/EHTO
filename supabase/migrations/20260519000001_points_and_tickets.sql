-- Activity points (engagement signal) and tickets (paid/granted currency).
-- See PRD §6 — kept as separate counters by design.

alter table public.profiles
  add column if not exists activity_points int not null default 0,
  add column if not exists tickets int not null default 0;

-- Helper: when a user signs in for the first time and a profile row is
-- inserted, grant a small starter ticket allowance (V1 demo).
-- Real reward rules will live in dedicated migrations later.
create or replace function public.grant_starter_tickets()
returns trigger language plpgsql as $$
begin
  if new.tickets is null or new.tickets = 0 then
    new.tickets := 3;
  end if;
  return new;
end $$;

drop trigger if exists profiles_starter_tickets on public.profiles;
create trigger profiles_starter_tickets
  before insert on public.profiles
  for each row execute function public.grant_starter_tickets();
