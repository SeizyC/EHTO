-- Per-world ambient cooldown timestamp. Used as a lightweight serialization
-- lock so concurrent /api/world/members polls (and the cron) don't all
-- decide to insert an ambient line at the same moment. The atomic
-- UPDATE ... WHERE last_ambient_at < threshold RETURNING id pattern
-- guarantees only one caller wins the claim per cooldown window.
alter table public.worlds
  add column if not exists last_ambient_at timestamptz;
