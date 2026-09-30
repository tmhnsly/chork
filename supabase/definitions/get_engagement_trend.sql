-- public.get_engagement_trend, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_engagement_trend(p_gym_id uuid, p_limit int default 12)
returns table (
  set_id               uuid,
  name                 text,
  starts_at            timestamptz,
  ends_at              timestamptz,
  status               text,
  active_climber_count int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1 where public.is_gym_admin(p_gym_id)
  ),
  recent as (
    select s.id, s.name, s.starts_at, s.ends_at, s.status
      from public.sets s, gate
     where s.gym_id = p_gym_id
     order by s.starts_at desc
     limit least(coalesce(p_limit, 12), 60)
  )
  select
    r.id        as set_id,
    r.name,
    r.starts_at,
    r.ends_at,
    r.status,
    (
      select count(distinct rl.user_id)::int
        from public.route_logs rl
        join public.routes rr on rr.id = rl.route_id
       where rr.set_id = r.id
    ) as active_climber_count
  from recent r
  order by r.starts_at asc; -- ascending for the sparkline chart
$$;
