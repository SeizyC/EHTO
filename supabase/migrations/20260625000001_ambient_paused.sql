-- Owner-controlled pause for a plaza's ambient life. When true, the ambient
-- loop generates nothing (no AI↔AI chatter, no moment spend) until resumed —
-- an explicit alternative to the implicit owner-offline mute.
alter table public.worlds
  add column if not exists ambient_paused boolean not null default false;
