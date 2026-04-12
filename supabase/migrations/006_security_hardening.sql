-- 006: Security hardening — plug cross-gym leaks in RPCs and RLS
--
-- 1. Leaderboard RPCs: verify p_set_id belongs to p_gym_id before returning data
-- 2. increment_comment_likes: add gym-membership gate
-- 3. activity_events RLS: stop leaking null-route events across gyms
--
-- Pattern: use an early-exit guard inside the function body where possible,
-- or add a cross-ownership check to the filtering clause.

-- ────────────────────────────────────────────────────────────────
-- 1. Leaderboard set-scoped RPCs — cross-ownership check
-- ────────────────────────────────────────────────────────────────

-- get_leaderboard_set: join sets and verify p_set_id ∈ p_gym_id
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
    join sets s on s.id = r.set_id
    where s.id = p_set_id
      and s.gym_id = p_gym_id   -- cross-ownership check
      and is_gym_member(p_gym_id)
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
  order by r.rank, p.username
  limit p_limit offset p_offset;
$$;

-- get_leaderboard_neighbourhood: cross-ownership check on p_set_id (if provided)
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
      and (p_set_id is null or s.id = p_set_id)
      and is_gym_member(p_gym_id)
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
  where r.rank between anchor.user_rank - 2 and anchor.user_rank + 2
  order by r.rank, p.username;
$$;

-- get_leaderboard_user_row: cross-ownership check on p_set_id (if provided)
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
      and (p_set_id is null or s.id = p_set_id)
      and is_gym_member(p_gym_id)
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

-- Also add sets.gym_id filter to get_leaderboard_all_time for defence-in-depth
-- (p_gym_id currently does nothing since we only check is_gym_member, but a
-- future FK relaxation could silently leak data)
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
      and is_gym_member(p_gym_id)
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
  order by r.rank, p.username
  limit p_limit offset p_offset;
$$;

-- ────────────────────────────────────────────────────────────────
-- 2. increment_comment_likes — gym-membership gate
-- ────────────────────────────────────────────────────────────────

create or replace function increment_comment_likes(p_comment_id uuid, p_delta integer)
returns integer
language sql volatile security definer
as $$
  update comments
  set likes = greatest(0, likes + p_delta)
  where id = p_comment_id
    and is_gym_member(gym_id)
  returning likes;
$$;

-- ────────────────────────────────────────────────────────────────
-- 3. activity_events RLS — no cross-gym leak for null-route events
-- ────────────────────────────────────────────────────────────────

drop policy if exists "Activity events are readable by gym members" on activity_events;

create policy "Activity events are readable by gym members"
  on activity_events for select
  to authenticated
  using (
    -- Null-route events: only visible to their owner (user-level events)
    -- Gym-scoped events: visible to gym members
    (route_id is null and user_id = auth.uid())
    or (route_id is not null and is_gym_member(gym_id))
  );
