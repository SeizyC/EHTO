-- Consumable ticket balances (monetization "포석").
--
-- One row per (user, ticket kind). Tickets are GRANTED manually / via a Plus
-- monthly bundle until real payments (PortOne) land, and CONSUMED atomically
-- server-side through the service role. Users may read their own balances.

create table if not exists public.ticket_balances (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.ticket_balances enable row level security;

-- Reads are self-only; all writes go through the service role (server),
-- which bypasses RLS, so no insert/update policy is exposed to clients.
create policy "tickets: self-read"
  on public.ticket_balances for select using (auth.uid() = user_id);
