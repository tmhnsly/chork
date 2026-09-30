-- public.handicap_points_tenths, as it stands.
-- Generated from supabase/migrations/098_handicap.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.handicap_points_tenths(
  p_attempts integer,
  p_completed boolean,
  p_zone boolean,
  p_route_grade smallint,
  p_ceiling smallint
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_route_grade is null or p_ceiling is null
      then public.compute_points(p_attempts, p_completed, p_zone) * 10
    else round(
      public.compute_points(p_attempts, p_completed, p_zone)
      * public.handicap_multiplier(p_route_grade, p_ceiling)
      * 10
    )::integer
  end;
$$;
