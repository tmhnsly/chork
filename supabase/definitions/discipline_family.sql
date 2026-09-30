-- public.discipline_family, as it stands.
-- Generated from supabase/migrations/117_a_mixed_day.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.discipline_family(p_discipline text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_discipline = 'boulder' then 'boulder' else 'rope' end;
$$;
