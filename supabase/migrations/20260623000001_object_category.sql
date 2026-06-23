-- Object taxonomy phase 1: categorize the catalog + capture generation guide.
-- See docs/superpowers/specs/2026-06-23-world-object-taxonomy-design.md
--
-- category  : render band + size tier + generation prompt family.
-- gen_description : the English description a sprite was generated from. Kept so
--                   approved objects can seed a per-tier few-shot style guide.
-- is_exemplar     : admin-approved "use this as a guide example" flag.

alter table public.object_types
  add column if not exists category text not null default 'prop'
    check (category in ('prop','landmark','building','sky','pet')),
  add column if not exists gen_description text,
  add column if not exists is_exemplar boolean not null default false;

create index if not exists object_types_category_idx
  on public.object_types(category);

-- Backfill the 9 bootstrapped static types. Idempotent (only sets rows still
-- on the 'prop' default for their known key).
update public.object_types set category = 'landmark'
  where type_key in ('fountain','lamp','tree');
update public.object_types set category = 'pet'
  where type_key in ('dog_shiba','dog_maltese','dog_retriever','dog_dachshund');
-- bench, planter stay 'prop' (the default).
