-- public.chork_allowance, as it stands.
-- Generated from supabase/migrations/111_chork_game_mode.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.chork_allowance(
  p_setter_attempts integer,
  p_challenge_grade smallint,
  p_ceiling smallint
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(coalesce(p_setter_attempts, 0), 1)
       + case
           -- Unknown either side: an ungraded route, or a climber who
           -- declared no limit. Guessing is worse than not helping.
           when p_challenge_grade is null or p_ceiling is null then 0
           -- At or below your limit buys nothing.
           else greatest(0, p_challenge_grade - p_ceiling)
         end;
$$;
