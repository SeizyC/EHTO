-- Add a `kind` discriminator to messages so we can distinguish system
-- notifications (member entered/left, room created) from regular chat
-- without overloading the text column. Default 'chat' keeps existing
-- rows valid. Allowed: 'chat' | 'system'.

alter table public.messages
  add column if not exists kind text not null default 'chat'
    check (kind in ('chat', 'system'));

-- System messages are owner-less (no member_id, no user_id) — relax the
-- XOR check so they can have both null.
alter table public.messages drop constraint if exists messages_one_sender;
alter table public.messages add constraint messages_one_sender check (
  kind = 'system'
  or (owner_user_id is not null and owner_member_id is null)
  or (owner_user_id is null and owner_member_id is not null)
);
