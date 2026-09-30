-- public.get_zone_send_ratio, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_zone_send_ratio(p_set_id uuid)
returns table (
  route_id    uuid,
  number      int,
  has_zone    boolean,
  send_count  int,   -- completed = true
  zone_only   int    -- zone = true AND completed = false
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select
    r.id as route_id,
    r.number,
    r.has_zone,
    coalesce(count(*) filter (where rl.completed), 0)::int                       as send_count,
    coalesce(count(*) filter (where rl.zone and not rl.completed), 0)::int       as zone_only
  from public.routes r
  left join public.route_logs rl on rl.route_id = r.id
  where r.set_id = p_set_id
    and exists (select 1 from gate)
  group by r.id, r.number, r.has_zone
  order by r.number;
$$;
