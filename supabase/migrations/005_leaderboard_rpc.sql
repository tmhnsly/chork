-- 005: Leaderboard RPC functions
--
-- Four functions for per-gym ranked leaderboards:
-- 1. get_leaderboard_set              — paginated, set-scoped
-- 2. get_leaderboard_all_time         — paginated, all-time
-- 3. get_leaderboard_neighbourhood    — 5 rows centred on user (set or all-time)
-- 4. get_leaderboard_user_row         — user's own row + rank
--
-- Ranking: DENSE_RANK over (points DESC, flashes DESC, sends DESC).
-- Points parity with computePoints():
--   flash=4, 2att=3, 3att=2, 4+att=1, incomplete=0, + zone bonus 1.
--
-- All functions guard with is_gym_member() to prevent cross-gym leaks.

-- ────────────────────────────────────────────────────────────────
-- Per-log points expression (reused across functions)
-- ────────────────────────────────────────────────────────────────
-- Not a standalone function — inlined via CTE in each RPC below
-- so the query planner can optimise alongside joins.

-- ────────────────────────────────────────────────────────────────
-- get_leaderboard_set
-- ────────────────────────────────────────────────────────────────
create or replace function get_leaderboard_set(
  p_gym_id uuid,
  p_set_id uuid,
  p_limit int default 10,
  p_offset int default 0
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
language sql stable security definer as $$
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from route_logs rl
    join routes r on r.id = rl.route_id
    where r.set_id = p_set_id
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
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join profiles p on p.id = r.user_id
  where is_gym_member(p_gym_id)
  order by r.rank, p.username
  limit p_limit offset p_offset;
$$;

grant execute on function get_leaderboard_set(uuid, uuid, int, int) to authenticated;

-- ────────────────────────────────────────────────────────────────
-- get_leaderboard_all_time
-- ────────────────────────────────────────────────────────────────
create or replace function get_leaderboard_all_time(
  p_gym_id uuid,
  p_limit int default 10,
  p_offset int default 0
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
language sql stable security definer as $$
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from route_logs rl
    join routes r on r.id = rl.route_id
    join sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
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
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join profiles p on p.id = r.user_id
  where is_gym_member(p_gym_id)
  order by r.rank, p.username
  limit p_limit offset p_offset;
$$;

grant execute on function get_leaderboard_all_time(uuid, int, int) to authenticated;

-- ────────────────────────────────────────────────────────────────
-- get_leaderboard_neighbourhood
-- Returns 5 rows centred on the user (rank - 2 to rank + 2).
-- p_set_id NULL → all-time ranking.
-- Returns empty set if user has no climbs.
-- ────────────────────────────────────────────────────────────────
create or replace function get_leaderboard_neighbourhood(
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
language sql stable security definer as $$
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from route_logs rl
    join routes r on r.id = rl.route_id
    join sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
      and (p_set_id is null or r.set_id = p_set_id)
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
  anchor as (
    select rank as user_rank from ranked where user_id = p_user_id
  )
  select
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join profiles p on p.id = r.user_id
  cross join anchor
  where is_gym_member(p_gym_id)
    and r.rank between anchor.user_rank - 2 and anchor.user_rank + 2
  order by r.rank, p.username;
$$;

grant execute on function get_leaderboard_neighbourhood(uuid, uuid, uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────
-- get_leaderboard_user_row
-- Returns user's own row + rank, or zero-stats row with rank NULL
-- if they have no qualifying logs. Always returns exactly one row.
-- ────────────────────────────────────────────────────────────────
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
language sql stable security definer as $$
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from route_logs rl
    join routes r on r.id = rl.route_id
    join sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
      and (p_set_id is null or r.set_id = p_set_id)
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
  from profiles p
  left join ranked r on r.user_id = p.id
  where p.id = p_user_id
    and is_gym_member(p_gym_id);
$$;

grant execute on function get_leaderboard_user_row(uuid, uuid, uuid) to authenticated;
