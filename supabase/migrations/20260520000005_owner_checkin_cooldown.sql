-- Track the last time an AI member directly addressed the room owner.
-- Used by ambient-loop to keep proactive check-ins to ~2–3 times per day
-- (cooldown of 8h means at most 3 per 24h even at 100% roll rate).
alter table public.worlds
  add column if not exists last_owner_checkin_at timestamptz;
