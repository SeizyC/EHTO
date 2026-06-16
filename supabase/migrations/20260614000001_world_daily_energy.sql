-- Daily life-energy metering (monetization Layer 2).
--
-- Two independent daily counters per plaza, both reset at KST midnight
-- (the app compares moments_day / interject_day against the current KST
-- date string and zeroes used when it rolls):
--   · moments_*    AI<->AI ambient chatter — the cost governor
--   · interject_*  replies to the owner's own messages — always-available reserve
-- plan: manual flag until real billing lands ('free' | 'plus').

alter table public.worlds
  add column if not exists plan            text    not null default 'free',
  add column if not exists moments_used    integer not null default 0,
  add column if not exists moments_day     text,
  add column if not exists interject_used  integer not null default 0,
  add column if not exists interject_day   text;
