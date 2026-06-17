-- Allow androgynous ('nb') gender option in characters.
-- The original schema check restricted to ('m','f'); the prompt builder
-- now offers a 3rd option that the table must accept.

alter table public.characters drop constraint if exists characters_gender_check;
alter table public.characters
  add constraint characters_gender_check check (gender in ('m', 'f', 'nb'));
