-- public.get_user_set_stats, as it stands.
-- Generated from supabase/migrations/063_compute_points_fn.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function get_user_set_stats(p_user_id uuid, p_gym_id uuid)
returns table (set_id uuid, completions integer, flashes integer, points integer)
language sql stable security definer
set search_path = ''
as $$
  select
    r.set_id,
    sum(case when rl.completed then 1 else 0 end)::integer as completions,
    sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::integer as flashes,
    sum(public.compute_points(rl.attempts, rl.completed, rl.zone))::integer as points
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  join public.sets s on s.id = r.set_id
  where rl.user_id = p_user_id
    and s.gym_id = p_gym_id
    and public.is_gym_member(p_gym_id)
  group by r.set_id;
$$;
