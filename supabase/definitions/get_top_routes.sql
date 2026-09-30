-- public.get_top_routes, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_top_routes(p_set_id uuid, p_limit int default 10)
returns table (
  route_id      uuid,
  number        int,
  has_zone      boolean,
  send_count    int,
  attempt_count int,
  flash_count   int,
  flash_rate    numeric   -- null when send_count is 0
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  ),
  agg as (
    select
      rl.route_id,
      count(*) filter (where rl.completed)::int                          as send_count,
      count(*) filter (where rl.attempts > 0)::int                       as attempt_count,
      count(*) filter (where rl.completed and rl.attempts = 1)::int      as flash_count
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    where r.set_id = p_set_id
      and exists (select 1 from gate)
    group by rl.route_id
  )
  select
    r.id                           as route_id,
    r.number,
    r.has_zone,
    coalesce(a.send_count, 0)      as send_count,
    coalesce(a.attempt_count, 0)   as attempt_count,
    coalesce(a.flash_count, 0)     as flash_count,
    case
      when coalesce(a.send_count, 0) = 0 then null
      else round(a.flash_count::numeric / a.send_count * 100, 1)
    end as flash_rate
  from public.routes r
  left join agg a on a.route_id = r.id
  where r.set_id = p_set_id
  order by coalesce(a.send_count, 0) desc, r.number asc
  limit least(coalesce(p_limit, 10), 100);
$$;
