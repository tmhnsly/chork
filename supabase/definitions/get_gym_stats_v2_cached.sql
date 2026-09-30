-- public.get_gym_stats_v2_cached, as it stands.
-- Generated from supabase/migrations/039_leaderboard_cached_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_gym_stats_v2_cached(
  p_gym_id uuid,
  p_set_id uuid default null
)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with set_check as (
    select 1
    where p_set_id is null
       or exists (
         select 1 from public.sets s
         where s.id = p_set_id and s.gym_id = p_gym_id
       )
  ),
  all_time as (
    select
      coalesce((
        select count(distinct rl.user_id)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id and rl.completed = true
      ), 0) as climbers,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id and rl.completed = true
      ), 0) as sends,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id
          and rl.completed = true and rl.attempts = 1
      ), 0) as flashes,
      coalesce((
        select count(*)::int
        from public.routes r
        join public.sets s on s.id = r.set_id
        where s.gym_id = p_gym_id
      ), 0) as routes
  ),
  set_stats as (
    select
      coalesce((
        select count(distinct rl.user_id)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id and rl.completed = true
      ), 0) as climbers,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id and rl.completed = true
      ), 0) as sends,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id
          and rl.completed = true and rl.attempts = 1
      ), 0) as flashes,
      coalesce((
        select count(*)::int
        from public.routes r
        where r.set_id = p_set_id
      ), 0) as routes
    where p_set_id is not null
  )
  select jsonb_build_object(
    'all_time',
      jsonb_build_object(
        'climbers', at.climbers,
        'sends',    at.sends,
        'flashes',  at.flashes,
        'routes',   at.routes
      ),
    'set',
      case
        when p_set_id is null then null
        else (
          select jsonb_build_object(
            'climbers', ss.climbers,
            'sends',    ss.sends,
            'flashes',  ss.flashes,
            'routes',   ss.routes
          )
          from set_stats ss
        )
      end
  )
  from all_time at, set_check;
$$;
