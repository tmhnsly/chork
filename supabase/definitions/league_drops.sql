-- public.league_drops, as it stands.
-- Generated from supabase/migrations/134_league_placings.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.league_drops(p_weeks integer)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_weeks >= 8 then 2
    when p_weeks >= 4 then 1
    else 0
  end
$$;
