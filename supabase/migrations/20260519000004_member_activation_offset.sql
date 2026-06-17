-- Per-member random activation offset (seconds from world creation).
-- Set once at seed time; lazy activation tick just compares elapsed.

alter table public.members
  add column if not exists activation_offset_seconds int;

-- For dormant members already seeded without offset, fill default by priority.
update public.members
   set activation_offset_seconds = activation_priority * 60
 where activated_at is null
   and activation_offset_seconds is null;
