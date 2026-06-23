-- EHTO purchases (Stripe). The primary key is the Stripe Checkout session id,
-- which makes the webhook grant idempotent (one row → one grant, retries no-op).
-- Writes happen only via the service role (webhook); RLS lets owners read theirs.

create table if not exists public.ehto_purchases (
  id          text primary key,        -- stripe checkout session id
  user_id     uuid not null references auth.users(id) on delete cascade,
  ehto        int  not null,
  amount_krw  int,
  pack_id     text,
  created_at  timestamptz not null default now()
);

create index if not exists ehto_purchases_user_idx on public.ehto_purchases(user_id);

alter table public.ehto_purchases enable row level security;

create policy "ehto_purchases: owner read"
  on public.ehto_purchases for select using (auth.uid() = user_id);
