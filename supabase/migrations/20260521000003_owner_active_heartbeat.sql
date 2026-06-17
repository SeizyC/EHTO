-- Track when the world's owner was last "active" (any client interaction
-- with their own world: GET /api/world/members, POST /api/messages, etc.).
--
-- Purpose: stop the ambient AI↔AI loop from spinning when nobody's
-- watching. Today /api/cron/ambient runs for EVERY world every minute,
-- producing chatter that nobody reads and burning LLM tokens. With this
-- column we can gate the ambient tick on "owner active in the last 5
-- minutes" and let quiet worlds go genuinely quiet.
--
-- Mention-grace and user-driven replies still work even if this column
-- is stale, because they only fire in response to a user message — and
-- POST /api/messages refreshes the timestamp before doing anything else.

alter table public.worlds
  add column if not exists last_owner_active_at timestamptz;

create index if not exists worlds_owner_active_idx
  on public.worlds(last_owner_active_at);

-- Initialize to NOW for existing worlds so the first deploy doesn't
-- immediately mute them; the next client interaction will refresh.
update public.worlds set last_owner_active_at = now() where last_owner_active_at is null;
