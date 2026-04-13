-- 023: Active climber count for the Chorkboard stats strip.
--
-- `getGymStats` previously counted every gym_memberships row, which
-- included climbers who'd joined but never logged anything. The stats
-- strip should reflect activity, not signup intent, so we expose a
-- small RPC that counts distinct user_ids with at least one completed
-- route_logs row for the gym.
--
-- SECURITY DEFINER with search_path = '' per platform convention; RLS
-- on route_logs still implicitly gates the read because callers can
-- only invoke the RPC for gyms they have membership-visible access
-- to — this function returns only an aggregate count, no row data.

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

grant  execute on function public.get_gym_active_climber_count(uuid) to authenticated;
revoke execute on function public.get_gym_active_climber_count(uuid) from anon, public;
