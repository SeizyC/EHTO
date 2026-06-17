-- Per-pair member affinity tracker. Phase 3 of the "관계" arc:
--   Phase 1 — in-the-moment peer engagement (intent bias)
--   Phase 2 — diary references peers ("시연이랑 야근 얘기 했음")
--   Phase 3 — persistent table of who-interacts-with-whom + topics
--
-- Storage convention: member_a_id is always the lexicographically
-- smaller uuid so we never have two rows for the same pair. The upsert
-- helper in lib/member-relations.ts sorts before writing.
--
-- interaction_count tracks lifetime exchanges (used as a rough "친밀도"
-- score). shared_topics is a short jsonb array of recent topic phrases
-- so prompts can say "둘이 그때 ___ 얘기 했었지". last_interaction_at
-- gates "recent" suggestions in the speaker's prompt.

create table if not exists public.member_relations (
  member_a_id            uuid not null references public.members(id) on delete cascade,
  member_b_id            uuid not null references public.members(id) on delete cascade,
  interaction_count      int not null default 0,
  last_interaction_at    timestamptz not null default now(),
  shared_topics          jsonb not null default '[]'::jsonb,
  updated_at             timestamptz not null default now(),
  primary key (member_a_id, member_b_id),
  constraint member_relations_ordered check (member_a_id < member_b_id)
);

create index if not exists member_relations_a_recent_idx
  on public.member_relations(member_a_id, last_interaction_at desc);
create index if not exists member_relations_b_recent_idx
  on public.member_relations(member_b_id, last_interaction_at desc);
