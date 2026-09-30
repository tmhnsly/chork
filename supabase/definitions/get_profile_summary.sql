-- public.get_profile_summary, as it stands.
-- Generated from supabase/migrations/038_profile_summary_extended.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_profile_summary(
  p_user_id uuid,
  p_gym_id  uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with gated as (
    select 1 where public.is_gym_member(p_gym_id)
  ),
  per_set as (
    select
      uss.set_id,
      uss.sends,
      uss.flashes,
      uss.zones,
      uss.points
    from public.user_set_stats uss, gated
    where uss.user_id = p_user_id
      and uss.gym_id  = p_gym_id
  ),
  active_set as (
    select s.id as set_id
    from public.sets s, gated
    where s.gym_id = p_gym_id
      and s.active = true
    limit 1
  ),
  active_detail as (
    select
      rl.route_id,
      rl.attempts,
      rl.completed,
      rl.zone
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join active_set a on a.set_id = r.set_id
    where rl.user_id = p_user_id
      and rl.gym_id  = p_gym_id
  ),
  total_routes as (
    select count(*)::int as n
    from public.routes r
    join public.sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
  ),
  -- Total attempts and unique attempted routes across every set the
  -- climber has touched in this gym (matches computeAllTimeAggregates
  -- in src/lib/data/profile-stats.ts).
  attempt_totals as (
    select
      coalesce(sum(rl.attempts), 0)::int        as total_attempts,
      count(distinct rl.route_id) filter (
        where rl.attempts > 0
      )::int                                    as unique_routes_attempted
    from public.route_logs rl, gated
    where rl.user_id = p_user_id
      and rl.gym_id  = p_gym_id
  )
  select jsonb_build_object(
    'per_set',
      coalesce((select jsonb_agg(to_jsonb(ps)) from per_set ps), '[]'::jsonb),
    'active_set_detail',
      coalesce((select jsonb_agg(to_jsonb(ad)) from active_detail ad), '[]'::jsonb),
    'total_routes_in_gym',
      coalesce((select n from total_routes), 0),
    'total_attempts',
      coalesce((select total_attempts from attempt_totals), 0),
    'unique_routes_attempted',
      coalesce((select unique_routes_attempted from attempt_totals), 0)
  )
  where exists (select 1 from gated);
$$;
