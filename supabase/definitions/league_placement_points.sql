-- public.league_placement_points, as it stands.
-- Generated from supabase/migrations/134_league_placings.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.league_placement_points(p_rank integer)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (case
    when p_rank is null or p_rank < 1 then 0
    when p_rank = 1 then 10
    when p_rank = 2 then 8
    when p_rank = 3 then 6
    when p_rank = 4 then 5
    when p_rank = 5 then 4
    when p_rank = 6 then 3
    when p_rank = 7 then 2
    else 1
  end)::smallint
$$;
