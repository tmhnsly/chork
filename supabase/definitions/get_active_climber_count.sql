-- public.get_active_climber_count, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_active_climber_count(p_set_id uuid)
returns int
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select s.gym_id
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select count(distinct rl.user_id)::int
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    where r.set_id = p_set_id
      and exists (select 1 from gate);
$$;
