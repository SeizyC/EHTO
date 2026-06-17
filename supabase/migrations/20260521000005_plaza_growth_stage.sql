-- Director plaza-growth milestone tracker. Stage counts how many growth
-- milestones the world has crossed; each milestone places ONE new
-- object on the plaza (fountain at week 1, lamp at week 2, etc.).
-- Idempotent advancement: the tick only acts when stage falls behind
-- the milestones the world has earned via age + message volume.

alter table public.worlds
  add column if not exists plaza_growth_stage int not null default 0;
