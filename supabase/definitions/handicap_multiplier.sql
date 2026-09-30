-- public.handicap_multiplier, as it stands.
-- Generated from supabase/migrations/098_handicap.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.handicap_multiplier(
  p_route_grade smallint,
  p_ceiling smallint
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    -- At or above your limit: full value, never more. A bonus above
    -- would make declaring a low ceiling strictly better than being
    -- honest, and a number everyone games is worse than no number.
    when p_route_grade is null or p_ceiling is null then 1.0
    when p_ceiling - p_route_grade <= 0 then 1.0
    when p_ceiling - p_route_grade = 1 then 0.7
    when p_ceiling - p_route_grade = 2 then 0.4
    -- Further below: nothing. This is the balance mechanism, not an
    -- oversight — a warm-up costs a strong climber nothing, so it
    -- earns them nothing.
    else 0.0
  end::numeric;
$$;
