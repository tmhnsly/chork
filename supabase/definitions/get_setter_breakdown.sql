-- public.get_setter_breakdown, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_setter_breakdown(p_set_id uuid)
returns table (
  setter_name     text,
  route_count     int,
  total_sends     int,
  total_attempts  int,
  flash_rate      numeric  -- null when total_sends is 0
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
  by_route as (
    select
      r.setter_name,
      r.id as route_id,
      count(*) filter (where rl.completed)::int                         as sends,
      count(*) filter (where rl.attempts > 0)::int                      as attempts,
      count(*) filter (where rl.completed and rl.attempts = 1)::int     as flashes
    from public.routes r
    left join public.route_logs rl on rl.route_id = r.id
    where r.set_id = p_set_id
      and r.setter_name is not null
      and exists (select 1 from gate)
    group by r.setter_name, r.id
  )
  select
    setter_name,
    count(*)::int               as route_count,
    sum(sends)::int             as total_sends,
    sum(attempts)::int          as total_attempts,
    case
      when sum(sends) = 0 then null
      else round(sum(flashes)::numeric / sum(sends) * 100, 1)
    end as flash_rate
  from by_route
  group by setter_name
  order by total_sends desc, setter_name asc;
$$;
