-- 018: Admin dashboard RPCs
--
-- Every widget the admin sees runs on SQL aggregation — no client-side
-- row loops over route_logs. Each function guards with is_gym_admin so
-- a non-admin calling the RPC directly gets an empty set, not data.
--
-- Conventions:
--   • SECURITY DEFINER + search_path = '' in line with 008 / 012.
--   • Execute granted to authenticated (gated via is_gym_admin inside),
--     revoked from anon/public.
--   • Return `table (…)` shapes so Supabase can generate typed clients.
--   • All reads prefer the materialised `user_set_stats` table where
--     possible for ranking / per-user aggregates (013).
--
-- Widgets in this migration (matches the spec list):
--   A  get_set_overview            — total routes, sends, completion %, days remaining
--   B  get_top_routes              — ranked by sends / attempts / flash rate
--   C  get_active_climber_count    — climbers who've logged ≥1 row in a set
--   D  get_engagement_trend        — N most-recent sets with active climber counts
--   E  get_flash_leaderboard_set   — top N climbers by flash count in a set
--   F  get_zone_send_ratio         — per route, completed vs attempted-zone
--   G  get_community_grade_distribution — per route, grade bucket counts
--   H  get_setter_breakdown        — per setter, route count + sends + flash rate
--   I  get_all_time_overview       — unique climbers, total sends, most-popular route, set count

-- ────────────────────────────────────────────────────────────────
-- A. Active set overview
-- ────────────────────────────────────────────────────────────────
create or replace function public.get_set_overview(p_set_id uuid)
returns table (
  total_routes           int,
  total_sends            int,
  max_possible_sends     int,   -- total_routes × active_climbers
  send_completion_pct    int,   -- 0..100, integer for stable display
  days_remaining         int,   -- null when ends_at is null / past
  active_climber_count   int
)
language sql stable security definer
set search_path = ''
as $$
  with s as (
    select s.id, s.gym_id, s.starts_at, s.ends_at
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  ),
  route_count as (
    select count(*)::int as n from public.routes r
     where r.set_id = p_set_id
  ),
  participants as (
    select uss.user_id
      from public.user_set_stats uss
     where uss.set_id = p_set_id
  ),
  sends_sum as (
    select coalesce(sum(uss.sends), 0)::int as n
      from public.user_set_stats uss
     where uss.set_id = p_set_id
  )
  select
    (select n from route_count) as total_routes,
    (select n from sends_sum)    as total_sends,
    (select n from route_count) * (select count(*)::int from participants) as max_possible_sends,
    case
      when (select count(*) from participants) = 0 or (select n from route_count) = 0 then 0
      else least(
        100,
        round(
          100.0 * (select n from sends_sum)::numeric
          / ((select n from route_count) * (select count(*) from participants))::numeric
        )::int
      )
    end as send_completion_pct,
    case
      when (select ends_at from s) is null then null
      when (select ends_at from s) < now() then 0
      else extract(day from ((select ends_at from s) - now()))::int
    end as days_remaining,
    (select count(*)::int from participants) as active_climber_count
  from s;
$$;

grant  execute on function public.get_set_overview(uuid) to authenticated;
revoke execute on function public.get_set_overview(uuid) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- B. Top routes for a set
-- ────────────────────────────────────────────────────────────────
-- Callers pass a metric ∈ {'sends', 'attempts', 'flash_rate'} and a
-- limit. Returns per-route send/attempt/flash counts; the frontend
-- orders by metric so we don't duplicate the function three times.

create or replace function public.get_top_routes(p_set_id uuid, p_limit int default 10)
returns table (
  route_id      uuid,
  number        int,
  has_zone      boolean,
  send_count    int,
  attempt_count int,
  flash_count   int,
  flash_rate    numeric   -- null when send_count is 0
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  ),
  agg as (
    select
      rl.route_id,
      count(*) filter (where rl.completed)::int                          as send_count,
      count(*) filter (where rl.attempts > 0)::int                       as attempt_count,
      count(*) filter (where rl.completed and rl.attempts = 1)::int      as flash_count
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    where r.set_id = p_set_id
      and exists (select 1 from gate)
    group by rl.route_id
  )
  select
    r.id                           as route_id,
    r.number,
    r.has_zone,
    coalesce(a.send_count, 0)      as send_count,
    coalesce(a.attempt_count, 0)   as attempt_count,
    coalesce(a.flash_count, 0)     as flash_count,
    case
      when coalesce(a.send_count, 0) = 0 then null
      else round(a.flash_count::numeric / a.send_count * 100, 1)
    end as flash_rate
  from public.routes r
  left join agg a on a.route_id = r.id
  where r.set_id = p_set_id
  order by coalesce(a.send_count, 0) desc, r.number asc
  limit least(coalesce(p_limit, 10), 100);
$$;

grant  execute on function public.get_top_routes(uuid, int) to authenticated;
revoke execute on function public.get_top_routes(uuid, int) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- C. Active climber count for a set
-- ────────────────────────────────────────────────────────────────
-- Active = climbers who have at least one route_logs row for a route
-- in the set (any state — attempted OR completed). Matches the spec:
-- "active climber for a given set = any user who has logged at least
-- one climb at that gym within that set's date range". We derive from
-- route_logs, not gym_memberships — memberships are static, activity
-- is the real signal.

create or replace function public.get_active_climber_count(p_set_id uuid)
returns int
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select s.gym_id
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select count(distinct rl.user_id)::int
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    where r.set_id = p_set_id
      and exists (select 1 from gate);
$$;

grant  execute on function public.get_active_climber_count(uuid) to authenticated;
revoke execute on function public.get_active_climber_count(uuid) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- D. Engagement trend — N most-recent sets with active climber counts
-- ────────────────────────────────────────────────────────────────
-- Used for the sparkline above the dashboard. Returns one row per set,
-- newest first, with the active-climber count derived the same way as
-- (C). Bound to the caller's admin gym.

create or replace function public.get_engagement_trend(p_gym_id uuid, p_limit int default 12)
returns table (
  set_id               uuid,
  name                 text,
  starts_at            timestamptz,
  ends_at              timestamptz,
  status               text,
  active_climber_count int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1 where public.is_gym_admin(p_gym_id)
  ),
  recent as (
    select s.id, s.name, s.starts_at, s.ends_at, s.status
      from public.sets s, gate
     where s.gym_id = p_gym_id
     order by s.starts_at desc
     limit least(coalesce(p_limit, 12), 60)
  )
  select
    r.id        as set_id,
    r.name,
    r.starts_at,
    r.ends_at,
    r.status,
    (
      select count(distinct rl.user_id)::int
        from public.route_logs rl
        join public.routes rr on rr.id = rl.route_id
       where rr.set_id = r.id
    ) as active_climber_count
  from recent r
  order by r.starts_at asc; -- ascending for the sparkline chart
$$;

grant  execute on function public.get_engagement_trend(uuid, int) to authenticated;
revoke execute on function public.get_engagement_trend(uuid, int) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- E. Flash leaderboard for a set (top N by flash count)
-- ────────────────────────────────────────────────────────────────
-- Pulls straight from user_set_stats so this is a single indexed scan.

create or replace function public.get_flash_leaderboard_set(p_set_id uuid, p_limit int default 5)
returns table (
  user_id      uuid,
  username     text,
  avatar_url   text,
  flash_count  int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select
    p.id         as user_id,
    p.username,
    p.avatar_url,
    uss.flashes  as flash_count
  from public.user_set_stats uss
  join public.profiles p on p.id = uss.user_id
  where uss.set_id = p_set_id
    and uss.flashes > 0
    and exists (select 1 from gate)
  order by uss.flashes desc, p.username asc
  limit least(coalesce(p_limit, 5), 50);
$$;

grant  execute on function public.get_flash_leaderboard_set(uuid, int) to authenticated;
revoke execute on function public.get_flash_leaderboard_set(uuid, int) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- F. Zone vs send ratio — per-route stacked bar data
-- ────────────────────────────────────────────────────────────────
-- Reveals routes where climbers are getting to the zone hold but not
-- topping out. Only meaningful for routes that actually have a zone;
-- routes without a zone return zone_only = 0 and send_count reflects
-- full completions only.

create or replace function public.get_zone_send_ratio(p_set_id uuid)
returns table (
  route_id    uuid,
  number      int,
  has_zone    boolean,
  send_count  int,   -- completed = true
  zone_only   int    -- zone = true AND completed = false
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select
    r.id as route_id,
    r.number,
    r.has_zone,
    coalesce(count(*) filter (where rl.completed), 0)::int                       as send_count,
    coalesce(count(*) filter (where rl.zone and not rl.completed), 0)::int       as zone_only
  from public.routes r
  left join public.route_logs rl on rl.route_id = r.id
  where r.set_id = p_set_id
    and exists (select 1 from gate)
  group by r.id, r.number, r.has_zone
  order by r.number;
$$;

grant  execute on function public.get_zone_send_ratio(uuid) to authenticated;
revoke execute on function public.get_zone_send_ratio(uuid) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- G. Community grade distribution — votes per route per grade bucket
-- ────────────────────────────────────────────────────────────────
-- Used only when the set uses a graded scale (hidden on points-only
-- sets by the dashboard layer). Returns one row per (route, grade)
-- bucket so the UI can render a per-route histogram.

create or replace function public.get_community_grade_distribution(p_set_id uuid)
returns table (
  route_id    uuid,
  number      int,
  grade       smallint,
  vote_count  int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select
    r.id        as route_id,
    r.number,
    rl.grade_vote as grade,
    count(*)::int as vote_count
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  where r.set_id = p_set_id
    and rl.grade_vote is not null
    and exists (select 1 from gate)
  group by r.id, r.number, rl.grade_vote
  order by r.number, rl.grade_vote;
$$;

grant  execute on function public.get_community_grade_distribution(uuid) to authenticated;
revoke execute on function public.get_community_grade_distribution(uuid) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- H. Setter breakdown — per setter engagement
-- ────────────────────────────────────────────────────────────────
-- Groups routes by their setter_name (internal-only field). Sets with
-- no setter names attached return an empty result so the UI can hide
-- the widget entirely.

create or replace function public.get_setter_breakdown(p_set_id uuid)
returns table (
  setter_name     text,
  route_count     int,
  total_sends     int,
  total_attempts  int,
  flash_rate      numeric  -- null when total_sends is 0
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  ),
  by_route as (
    select
      r.setter_name,
      r.id as route_id,
      count(*) filter (where rl.completed)::int                         as sends,
      count(*) filter (where rl.attempts > 0)::int                      as attempts,
      count(*) filter (where rl.completed and rl.attempts = 1)::int     as flashes
    from public.routes r
    left join public.route_logs rl on rl.route_id = r.id
    where r.set_id = p_set_id
      and r.setter_name is not null
      and exists (select 1 from gate)
    group by r.setter_name, r.id
  )
  select
    setter_name,
    count(*)::int               as route_count,
    sum(sends)::int             as total_sends,
    sum(attempts)::int          as total_attempts,
    case
      when sum(sends) = 0 then null
      else round(sum(flashes)::numeric / sum(sends) * 100, 1)
    end as flash_rate
  from by_route
  group by setter_name
  order by total_sends desc, setter_name asc;
$$;

grant  execute on function public.get_setter_breakdown(uuid) to authenticated;
revoke execute on function public.get_setter_breakdown(uuid) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- I. All-time overview for a gym
-- ────────────────────────────────────────────────────────────────
-- Single shot for the "All time" dashboard tab — unique climbers ever,
-- total sends ever, most-popular route across all sets, set count.

create or replace function public.get_all_time_overview(p_gym_id uuid)
returns table (
  unique_climbers      int,
  total_sends          int,
  set_count            int,
  top_route_id         uuid,
  top_route_number     int,
  top_route_set_id     uuid,
  top_route_send_count int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1 where public.is_gym_admin(p_gym_id)
  ),
  route_sends as (
    select
      r.id, r.number, r.set_id,
      count(*) filter (where rl.completed)::int as send_count
    from public.routes r
    join public.sets s on s.id = r.set_id
    left join public.route_logs rl on rl.route_id = r.id
    where s.gym_id = p_gym_id
      and exists (select 1 from gate)
    group by r.id, r.number, r.set_id
  ),
  top_route as (
    select id, number, set_id, send_count
      from route_sends
     order by send_count desc, number asc
     limit 1
  )
  select
    (
      select count(distinct rl.user_id)::int
        from public.route_logs rl
       where rl.gym_id = p_gym_id
    )                                                                  as unique_climbers,
    (
      select count(*)::int
        from public.route_logs rl
       where rl.gym_id = p_gym_id and rl.completed
    )                                                                  as total_sends,
    (select count(*)::int from public.sets where gym_id = p_gym_id)    as set_count,
    (select id        from top_route)                                  as top_route_id,
    (select number    from top_route)                                  as top_route_number,
    (select set_id    from top_route)                                  as top_route_set_id,
    (select send_count from top_route)                                 as top_route_send_count
  where exists (select 1 from gate);
$$;

grant  execute on function public.get_all_time_overview(uuid) to authenticated;
revoke execute on function public.get_all_time_overview(uuid) from anon, public;
