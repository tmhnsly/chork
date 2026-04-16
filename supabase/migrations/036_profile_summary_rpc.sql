-- 036: one-call RPC for the profile page
--
-- Replaces the two-stage pattern on /u/[username] where:
--   1. getAllRouteDataForUserInGym returned every raw log for the user
--      in the gym (large payload), and
--   2. the page aggregated per-set stats in JS.
--
-- The new RPC reads aggregates from the trigger-maintained
-- user_set_stats table (migration 013) and only returns raw logs for
-- the active set, which is where the PunchTile mini-grid + set-specific
-- badge evaluation genuinely need per-route state.
--
-- Payload shape:
--   {
--     "per_set": [{ set_id, sends, flashes, zones, points }, ...],
--     "active_set_detail": [{ route_id, attempts, completed, zone }, ...],
--     "total_routes_in_gym": <int>
--   }
--
-- Access: `is_gym_member(p_gym_id)` gates the caller. The summary only
-- returns data the caller is already authorised to see via RLS
-- (same gym).

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
  )
  select jsonb_build_object(
    'per_set',
      coalesce((select jsonb_agg(to_jsonb(ps)) from per_set ps), '[]'::jsonb),
    'active_set_detail',
      coalesce((select jsonb_agg(to_jsonb(ad)) from active_detail ad), '[]'::jsonb),
    'total_routes_in_gym',
      coalesce((select n from total_routes), 0)
  )
  where exists (select 1 from gated);
$$;

grant  execute on function public.get_profile_summary(uuid, uuid) to authenticated;
revoke execute on function public.get_profile_summary(uuid, uuid) from anon, public;
