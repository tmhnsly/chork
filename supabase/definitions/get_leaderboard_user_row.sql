-- public.get_leaderboard_user_row, as it stands.
-- Generated from supabase/migrations/063_compute_points_fn.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function get_leaderboard_user_row(
  p_gym_id uuid,
  p_user_id uuid,
  p_set_id uuid default null
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  rank bigint,
  sends int,
  flashes int,
  zones int,
  points int
)
language sql stable security definer
set search_path = ''
as $$
  with gym_logs as (
    select
      rl.user_id,
      public.compute_points(rl.attempts, rl.completed, rl.zone) as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
      and (p_set_id is null or s.id = p_set_id)
      and public.is_gym_member(p_gym_id)
  ),
  agg as (
    select
      gl.user_id,
      count(*) filter (where gl.completed)::int as sends,
      count(*) filter (where gl.is_flash)::int as flashes,
      count(*) filter (where gl.zone)::int as zones,
      sum(gl.log_points)::int as points
    from gym_logs gl
    group by gl.user_id
    having sum(gl.log_points) > 0
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc) as rank
    from agg a
  )
  select
    p.id as user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    coalesce(r.sends, 0) as sends,
    coalesce(r.flashes, 0) as flashes,
    coalesce(r.zones, 0) as zones,
    coalesce(r.points, 0) as points
  from public.profiles p
  left join ranked r on r.user_id = p.id
  where p.id = p_user_id
    and public.is_gym_member(p_gym_id);
$$;
