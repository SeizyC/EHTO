-- Music share cooldown — three daily slots (morning / lunch / evening)
-- each fire once per day per world. We could derive "already fired
-- today?" from messages.text matching open.spotify.com/, but a
-- dedicated stamp per slot is cleaner and lets us tune slot windows
-- without grep'ing the transcript.
--
-- Slots resolve via KST clock (the day-rollover module). Cooldown
-- check: if last_music_<slot>_at is today's slot or later, skip.

alter table public.worlds
  add column if not exists last_music_morning_at  timestamptz,
  add column if not exists last_music_lunch_at    timestamptz,
  add column if not exists last_music_evening_at  timestamptz;
