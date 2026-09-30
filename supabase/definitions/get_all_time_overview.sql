-- public.get_all_time_overview, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_all_time_overview(p_gym_id uuid)
returns table (
  unique_climbers      int,
  total_sends          int,
  set_count            int,
  top_route_id         uuid,
  top_route_number     int,
  top_route_set_id     uuid,
  top_route_send_count int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1 where public.is_gym_admin(p_gym_id)
  ),
  route_sends as (
    select
      r.id, r.number, r.set_id,
      count(*) filter (where rl.completed)::int as send_count
    from public.routes r
    join public.sets s on s.id = r.set_id
    left join public.route_logs rl on rl.route_id = r.id
    where s.gym_id = p_gym_id
      and exists (select 1 from gate)
    group by r.id, r.number, r.set_id
  ),
  top_route as (
    select id, number, set_id, send_count
      from route_sends
     order by send_count desc, number asc
     limit 1
  )
  select
    (
      select count(distinct rl.user_id)::int
        from public.route_logs rl
       where rl.gym_id = p_gym_id
    )                                                                  as unique_climbers,
    (
      select count(*)::int
        from public.route_logs rl
       where rl.gym_id = p_gym_id and rl.completed
    )                                                                  as total_sends,
    (select count(*)::int from public.sets where gym_id = p_gym_id)    as set_count,
    (select id        from top_route)                                  as top_route_id,
    (select number    from top_route)                                  as top_route_number,
    (select set_id    from top_route)                                  as top_route_set_id,
    (select send_count from top_route)                                 as top_route_send_count
  where exists (select 1 from gate);
$$;
