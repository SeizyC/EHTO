-- Enable Supabase Realtime on the two tables the plaza watches.
--
-- Replaces the 8s GET polling loop in src/app/world/page.tsx. The client
-- subscribes per-world to:
--   · messages  → new chat lines (user msgs + AI replies + system notices),
--                 and deletions (owner-purged rows).
--   · members   → new activations and status flips (active ↔ fading ↔ away).
--
-- RLS already restricts SELECT on both tables to the world owner, so the
-- realtime stream is automatically scoped — no extra channel-level auth.

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.members;

-- UPDATEs / DELETEs need REPLICA IDENTITY FULL so the OLD row's filterable
-- columns (world_id) survive the WAL → realtime translation. Without this,
-- a DELETE event arrives with NULL world_id and the client can't filter it.
alter table public.messages replica identity full;
alter table public.members  replica identity full;
