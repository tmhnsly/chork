-- 039: cached-friendly RPC variants for the leaderboard hot path.
--
-- The existing get_leaderboard_set / _all_time / get_gym_stats_v2 RPCs
-- gate access via `is_gym_member(p_gym_id)`, which reads `auth.uid()`.
-- That's correct when called from a per-request authed Supabase
-- client, but blocks the unstable_cache pattern: cache entries are
-- shared across users so the cached body uses a service-role client,
-- and `auth.uid()` is null under service role — the gate evaluates
-- false, the RPC returns empty, and the cache fills with empties.
--
-- These _cached variants drop the auth gate. They're granted to
-- service_role ONLY (revoked from authenticated + anon + public),
-- so the gate is enforced in app code BEFORE the cached call:
--
--   const member = await isGymMember(supabase, gymId);   // cheap
--   if (!member) return [];                              // page-level gate
--   const rows = await getLeaderboardCached(gymId, setId, limit, offset);
--
-- Net: one cache entry per (gym_id, set_id, limit, offset) shared
-- across every gym member viewing the board. N concurrent viewers
-- now cost 1 DB compute per mutation instead of N per refresh.
--
-- Security model:
-- - The cached RPC trusts that its caller (service-role inside
--   unstable_cache) has already verified gym membership.
-- - Service-role grant is the only way to invoke these — `revoke
--   execute … from authenticated, anon, public`.
-- - PostgREST normally exposes service-role RPCs only via the
--   service-role API key, which never reaches the browser.

-- ────────────────────────────────────────────────────────────────
-- get_leaderboard_set_cached
-- ────────────────────────────────────────────────────────────────
create or replace function public.get_leaderboard_set_cached(
  p_gym_id uuid,
  p_set_id uuid,
  p_limit  int default 10,
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
language sql stable security definer
set search_path = ''
as $$
  with set_check as (
    -- Belt-and-braces: still verify the set belongs to the gym so a
    -- mismatched (gym_id, set_id) pair returns nothing rather than
    -- leaking another gym's leaderboard via a forged cache key.
    select 1 from public.sets s
    where s.id = p_set_id and s.gym_id = p_gym_id
  ),
  ranked as (
    select
      uss.user_id,
      uss.sends,
      uss.flashes,
      uss.zones,
      uss.points,
      dense_rank() over (
        order by uss.points desc, uss.flashes desc, uss.sends desc
      ) as rank
    from public.user_set_stats uss, set_check
    where uss.set_id = p_set_id
      and uss.points > 0
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
  join public.profiles p on p.id = r.user_id
  order by r.rank, p.username
  limit least(coalesce(p_limit, 10), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.get_leaderboard_set_cached(uuid, uuid, int, int)
  from anon, public, authenticated;
grant execute on function public.get_leaderboard_set_cached(uuid, uuid, int, int)
  to service_role;

-- ────────────────────────────────────────────────────────────────
-- get_leaderboard_all_time_cached
-- ────────────────────────────────────────────────────────────────
create or replace function public.get_leaderboard_all_time_cached(
  p_gym_id uuid,
  p_limit  int default 10,
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
language sql stable security definer
set search_path = ''
as $$
  with agg as (
    select
      uss.user_id,
      sum(uss.sends)::int   as sends,
      sum(uss.flashes)::int as flashes,
      sum(uss.zones)::int   as zones,
      sum(uss.points)::int  as points
    from public.user_set_stats uss
    where uss.gym_id = p_gym_id
    group by uss.user_id
    having sum(uss.points) > 0
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (
        order by a.points desc, a.flashes desc, a.sends desc
      ) as rank
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
  join public.profiles p on p.id = r.user_id
  order by r.rank, p.username
  limit least(coalesce(p_limit, 10), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.get_leaderboard_all_time_cached(uuid, int, int)
  from anon, public, authenticated;
grant execute on function public.get_leaderboard_all_time_cached(uuid, int, int)
  to service_role;

-- ────────────────────────────────────────────────────────────────
-- get_gym_stats_v2_cached
-- ────────────────────────────────────────────────────────────────
-- Same payload shape as get_gym_stats_v2 (mig 037) — both all_time
-- and set-scoped buckets in one shot.
create or replace function public.get_gym_stats_v2_cached(
  p_gym_id uuid,
  p_set_id uuid default null
)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with set_check as (
    select 1
    where p_set_id is null
       or exists (
         select 1 from public.sets s
         where s.id = p_set_id and s.gym_id = p_gym_id
       )
  ),
  all_time as (
    select
      coalesce((
        select count(distinct rl.user_id)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id and rl.completed = true
      ), 0) as climbers,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id and rl.completed = true
      ), 0) as sends,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id
          and rl.completed = true and rl.attempts = 1
      ), 0) as flashes,
      coalesce((
        select count(*)::int
        from public.routes r
        join public.sets s on s.id = r.set_id
        where s.gym_id = p_gym_id
      ), 0) as routes
  ),
  set_stats as (
    select
      coalesce((
        select count(distinct rl.user_id)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id and rl.completed = true
      ), 0) as climbers,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id and rl.completed = true
      ), 0) as sends,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id
          and rl.completed = true and rl.attempts = 1
      ), 0) as flashes,
      coalesce((
        select count(*)::int
        from public.routes r
        where r.set_id = p_set_id
      ), 0) as routes
    where p_set_id is not null
  )
  select jsonb_build_object(
    'all_time',
      jsonb_build_object(
        'climbers', at.climbers,
        'sends',    at.sends,
        'flashes',  at.flashes,
        'routes',   at.routes
      ),
    'set',
      case
        when p_set_id is null then null
        else (
          select jsonb_build_object(
            'climbers', ss.climbers,
            'sends',    ss.sends,
            'flashes',  ss.flashes,
            'routes',   ss.routes
          )
          from set_stats ss
        )
      end
  )
  from all_time at, set_check;
$$;

revoke execute on function public.get_gym_stats_v2_cached(uuid, uuid)
  from anon, public, authenticated;
grant execute on function public.get_gym_stats_v2_cached(uuid, uuid)
  to service_role;
