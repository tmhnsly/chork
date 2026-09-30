-- public.get_leaderboard_neighbourhood, as it stands.
-- Generated from supabase/migrations/074_neighbourhood_board_position.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create function public.get_leaderboard_neighbourhood(
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
  points int,
  board_position int
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
  ),
  -- Position is computed over the whole board, before the window is
  -- narrowed — a row_number taken after filtering would restart at the
  -- top of the slice and be meaningless as an offset.
  positioned as (
    select
      r.user_id,
      p.username,
      p.name,
      p.avatar_url,
      r.rank,
      r.sends,
      r.flashes,
      r.zones,
      r.points,
      (row_number() over (order by r.rank, p.username) - 1)::int as board_position
    from ranked r
    join public.profiles p on p.id = r.user_id
  ),
  anchor as (
    select rank as user_rank from ranked where user_id = p_user_id
  )
  select
    pos.user_id,
    pos.username,
    pos.name,
    pos.avatar_url,
    pos.rank,
    pos.sends,
    pos.flashes,
    pos.zones,
    pos.points,
    pos.board_position
  from positioned pos
  cross join anchor
  -- Still a rank window, deliberately: "the climbers either side of
  -- you" is about standings, so a three-way tie two ranks below should
  -- show all three rather than be cut off mid-tie.
  where pos.rank between anchor.user_rank - 2 and anchor.user_rank + 2
  order by pos.rank, pos.username;
$$;
