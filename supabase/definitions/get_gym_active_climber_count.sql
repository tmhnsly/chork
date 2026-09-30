-- public.get_gym_active_climber_count, as it stands.
-- Generated from supabase/migrations/023_gym_active_climber_count.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_gym_active_climber_count(p_gym_id uuid)
returns int
language sql
security definer
stable
set search_path = ''
as $$
  select count(distinct user_id)::int
  from public.route_logs
  where gym_id = p_gym_id
    and completed = true;
$$;
