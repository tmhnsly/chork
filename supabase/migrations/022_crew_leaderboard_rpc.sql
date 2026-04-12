-- 022: Crew leaderboard + activity feed RPCs
--
-- Two SQL-side aggregates powering the Crew tab:
--   • get_crew_leaderboard(crew_id, set_id, limit, offset) — active
--     members ranked by points on a specific gym set. Members with no
--     stats row for the set still appear at the bottom with zero
--     points (per spec) so the whole crew is always visible.
--   • get_crew_activity_feed(limit, before) — union feed across every
--     crew the caller is an active member of. Excludes the caller's
--     own events. Cursor-paginated via `before` (ISO timestamp).
--
-- Both are SECURITY DEFINER with search_path = '' and are gated on
-- the caller's own active-membership — no cross-crew leak.

-- ────────────────────────────────────────────────────────────────
-- get_crew_leaderboard
-- ────────────────────────────────────────────────────────────────
create or replace function public.get_crew_leaderboard(
  p_crew_id uuid,
  p_set_id  uuid,
  p_limit   int default 50,
  p_offset  int default 0
)
returns table (
  user_id    uuid,
  username   text,
  name       text,
  avatar_url text,
  rank       bigint,
  sends      int,
  flashes    int,
  zones      int,
  points     int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1 where public.is_active_crew_member(p_crew_id)
  ),
  roster as (
    select cm.user_id
      from public.crew_members cm, gate
     where cm.crew_id = p_crew_id
       and cm.status  = 'active'
  ),
  scored as (
    select
      r.user_id,
      coalesce(uss.sends, 0)   as sends,
      coalesce(uss.flashes, 0) as flashes,
      coalesce(uss.zones, 0)   as zones,
      coalesce(uss.points, 0)  as points
    from roster r
    left join public.user_set_stats uss
      on uss.user_id = r.user_id
     and uss.set_id  = p_set_id
  ),
  ranked as (
    select
      s.*,
      -- Unranked (zero points) climbers go to the bottom with rank null
      -- converted to a big-rank sentinel so the single ORDER BY sorts
      -- cleanly.
      case when s.points > 0
        then dense_rank() over (
          partition by (s.points > 0)
          order by s.points desc, s.flashes desc, s.sends desc
        )
        else null
      end as rank
    from scored s
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
  order by (r.rank is null), r.rank, p.username
  limit least(coalesce(p_limit, 50), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant  execute on function public.get_crew_leaderboard(uuid, uuid, int, int) to authenticated;
revoke execute on function public.get_crew_leaderboard(uuid, uuid, int, int) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- get_crew_activity_feed
-- ────────────────────────────────────────────────────────────────
-- Surfaces completed / flashed events (and their zone flags) from every
-- crew the caller is active in. Only route_logs rows with completed =
-- true generate feed entries — feeds are about achievements, not
-- intermediate attempts. Cursor paginates by route_logs.updated_at.

create or replace function public.get_crew_activity_feed(
  p_limit  int  default 30,
  p_before timestamptz default null
)
returns table (
  route_log_id uuid,
  user_id      uuid,
  username     text,
  avatar_url   text,
  route_id     uuid,
  route_number int,
  set_id       uuid,
  set_name     text,
  set_starts_at timestamptz,
  set_ends_at   timestamptz,
  gym_id       uuid,
  gym_name     text,
  is_flash     boolean,
  is_zone      boolean,
  happened_at  timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  with crew_mates as (
    -- Every user who shares an active crew with the caller, excluding
    -- the caller themselves.
    select distinct other.user_id
      from public.crew_members me
      join public.crew_members other
        on other.crew_id = me.crew_id
       and other.status  = 'active'
     where me.user_id = (select auth.uid())
       and me.status  = 'active'
       and other.user_id <> (select auth.uid())
  )
  select
    rl.id           as route_log_id,
    rl.user_id,
    p.username,
    p.avatar_url,
    r.id            as route_id,
    r.number        as route_number,
    s.id            as set_id,
    s.name          as set_name,
    s.starts_at     as set_starts_at,
    s.ends_at       as set_ends_at,
    g.id            as gym_id,
    g.name          as gym_name,
    (rl.attempts = 1)  as is_flash,
    rl.zone            as is_zone,
    rl.updated_at   as happened_at
  from public.route_logs rl
  join crew_mates cm on cm.user_id = rl.user_id
  join public.routes   r on r.id = rl.route_id
  join public.sets     s on s.id = r.set_id
  join public.gyms     g on g.id = s.gym_id
  join public.profiles p on p.id = rl.user_id
  where rl.completed = true
    and (p_before is null or rl.updated_at < p_before)
  order by rl.updated_at desc
  limit least(coalesce(p_limit, 30), 100);
$$;

grant  execute on function public.get_crew_activity_feed(int, timestamptz) to authenticated;
revoke execute on function public.get_crew_activity_feed(int, timestamptz) from anon, public;
