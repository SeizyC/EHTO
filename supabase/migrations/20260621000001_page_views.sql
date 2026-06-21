-- Lightweight pageview log for the admin stats dashboard.
--
-- One row per client-side route view, written by /api/track (a fire-and-
-- forget beacon from a root-layout component). The server route reads the
-- visitor's country from the Cloudflare `cf-ipcountry` header — the client
-- never sends it. user_id is set when a session token accompanies the
-- beacon, null for anonymous visitors. Reads are admin-only via the service
-- role, so no client RLS policy is exposed.

create table if not exists public.page_views (
  id         uuid primary key default gen_random_uuid(),
  path       text not null,
  country    text,        -- ISO-2 from cf-ipcountry, or null (dev / unknown)
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_idx on public.page_views(created_at);
create index if not exists page_views_country_idx on public.page_views(country);
create index if not exists page_views_path_idx on public.page_views(path);

-- Writes + reads go through the service role (the beacon route and the admin
-- stats route). RLS on with no policy = clients can't read/write directly.
alter table public.page_views enable row level security;
