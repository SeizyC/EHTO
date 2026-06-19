-- Beta invite codes (invite-only gate + per-user viral growth).
--
-- Bootstrap codes are admin-seeded (owner_user_id null). On signup each user
-- is issued 3 one-time codes they own. A code is consumed (used_by set) at
-- onboarding finalize; when all of an owner's codes are consumed the owner
-- earns a bonus 'invite' ticket. Reads are self-scoped to codes you own;
-- all writes go through the service role (server), which bypasses RLS.
-- Validation of an arbitrary code at the gate is done server-side (service
-- role), never by a client read, so codes aren't enumerable.

create table if not exists public.beta_codes (
  code          text primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  used_by       uuid references auth.users(id) on delete set null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists beta_codes_owner_idx on public.beta_codes(owner_user_id);

alter table public.beta_codes enable row level security;

-- Owners may read their own codes (for the profile "초대" panel). Gate
-- validation + all writes happen via the service role server-side.
create policy "beta_codes: owner-read"
  on public.beta_codes for select using (auth.uid() = owner_user_id);

-- One-time completion-reward marker on profiles.
alter table public.profiles
  add column if not exists invite_reward_granted_at timestamptz;
