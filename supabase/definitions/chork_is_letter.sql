-- public.chork_is_letter, as it stands.
-- Generated from supabase/migrations/111_chork_game_mode.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.chork_is_letter(
  p_attempts integer,
  p_completed boolean,
  p_allowance integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (coalesce(p_completed, false) and coalesce(p_attempts, 0) <= p_allowance)
     and coalesce(p_attempts, 0) >= p_allowance;
$$;
