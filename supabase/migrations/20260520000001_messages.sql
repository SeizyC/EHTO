-- Chat message persistence.
--
-- Each row is one utterance, either by the world's owner (a user) or by one
-- of the world's members. XOR constraint enforces exactly one sender.
-- Messages live for the lifetime of the world unless purged later.
--
-- Bubble / landed state is a CLIENT view concern (TTL animation), not stored
-- here. Server simply records the message; client decides display lifecycle.

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  world_id          uuid not null references public.worlds(id) on delete cascade,
  owner_user_id     uuid     references auth.users(id) on delete cascade,
  owner_member_id   uuid     references public.members(id) on delete cascade,
  text              text not null,
  created_at        timestamptz not null default now(),
  -- exactly one sender
  constraint messages_one_sender check (
    (owner_user_id is not null and owner_member_id is null)
    or
    (owner_user_id is null and owner_member_id is not null)
  )
);

create index if not exists messages_world_recent_idx
  on public.messages(world_id, created_at desc);

alter table public.messages enable row level security;

-- World owner can read all messages in their world (user msgs + member msgs)
create policy "messages: owner read"
  on public.messages for select
  using (
    exists (select 1 from public.worlds w
            where w.id = messages.world_id
              and w.owner_id = auth.uid())
  );

-- World owner can insert their own user messages
create policy "messages: owner insert own"
  on public.messages for insert
  with check (
    owner_user_id = auth.uid()
    and exists (select 1 from public.worlds w
                where w.id = messages.world_id
                  and w.owner_id = auth.uid())
  );
-- Member messages are inserted server-side via service role (bypasses RLS).
