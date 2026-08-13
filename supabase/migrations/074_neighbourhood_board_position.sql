-- 074: give the neighbourhood a true board position, not just a rank
--
-- `dense_rank()` makes `rank` a *label*, not a *position*. Tied
-- climbers share one, so on a 51-climber board with three tied ranks
-- there are only 47 distinct values and `rank - 1` drifts away from
-- the row's actual offset — by 4 at the bottom of Yonder's board.
--
-- BrowseSection caches rows by absolute offset, because that is what
-- the paging RPCs take. It filled that cache two different ways:
--
--   seedCache(neighbourhood)  ->  cache[row.rank - 1] = row
--   fetchRange(start, count)  ->  cache[start + i]    = row
--
-- Those agree only while every rank is unique. Past the first tie they
-- disagree, the same climber gets written to two offsets, and the
-- 5-row window renders them twice — which is exactly what the board
-- showed: ranks 40, 41, 42, 43 followed by 40, 41, 42 again.
--
-- Fixing it in the client alone isn't possible: the neighbourhood rows
-- genuinely don't know where they sit in the paged board, and rank
-- cannot tell them. So return it.
--
-- `board_position` is 0-based to match the `p_offset` the paging RPCs
-- take, so `cache[row.board_position]` needs no arithmetic. It is
-- `row_number()` over `(rank, username)` — the *same* ordering
-- `get_leaderboard_set_cached` and `get_leaderboard_all_time_cached`
-- both use for their `order by ... limit ... offset`, which is what
-- makes the two line up. Change that ordering in one place and it must
-- change in all three.
--
-- Those cached RPCs read the materialised `user_set_stats` while this
-- one aggregates `route_logs` live; verified equal across all 51
-- climbers, so the derived ranks — and therefore positions — match.
--
-- Named `board_position` rather than `position` because `POSITION` is
-- an SQL keyword (the substring function) and isn't worth the quoting.
--
-- Return type changes, so the function has to be dropped rather than
-- replaced. Grants are re-applied below to match migration 013.
drop function if exists public.get_leaderboard_neighbourhood(uuid, uuid, uuid);

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

grant execute on function public.get_leaderboard_neighbourhood(uuid, uuid, uuid) to authenticated;
revoke execute on function public.get_leaderboard_neighbourhood(uuid, uuid, uuid) from anon, public;
