-- 063: Single source of truth for the scoring ladder in SQL
--
-- The points formula (flash=4, 2-try=3, 3-try=2, 4+-try=1,
-- incomplete=0, +1 if zone) was hand-inlined in nine live functions
-- across migrations 008 / 013 / 042 / 050 / 056. It is canonical in
-- TypeScript as computePoints() in src/lib/data/logs.ts; this
-- migration gives it one SQL home, public.compute_points(), and
-- recreates every live formula-bearing function on top of it. A
-- future scoring change is now one edit here + one in logs.ts.
--
-- Semantics note: two SQL variants had drifted on one edge. The
-- 008/013 copies award 1 point for any completed log regardless of
-- attempts; the 042/050/056 jam copies required `attempts >= 4` for
-- the 1-point rung (so a hypothetical completed log with attempts
-- outside 1..3 and not >= 4 scored 0). compute_points() unifies on
-- the 008 / computePoints() semantics: completed always scores at
-- least 1. Both `attempts` columns are non-null with attempts >= 1
-- enforced at the write path, so no live row changes score.
--
-- Function bodies below are otherwise byte-identical to their most
-- recent definitions:
--   get_leaderboard_set / _all_time / _neighbourhood / _user_row,
--   get_user_set_stats                      — migration 008
--   sync_user_set_stats                     — migration 013
--   get_user_all_time_stats                 — migration 042
--   end_jam                                 — migration 050
--   get_jam_leaderboard                     — migration 056

-- ────────────────────────────────────────────────────────────────
-- The scoring ladder
-- ────────────────────────────────────────────────────────────────

create or replace function public.compute_points(
  p_attempts integer,
  p_completed boolean,
  p_zone boolean
)
returns integer
language sql
immutable
parallel safe
as $$
  select (case
      when p_completed and p_attempts = 1 then 4
      when p_completed and p_attempts = 2 then 3
      when p_completed and p_attempts = 3 then 2
      when p_completed then 1
      else 0
    end)
    + (case when p_zone then 1 else 0 end);
$$;

comment on function public.compute_points(integer, boolean, boolean) is
  'Scoring ladder — mirrors computePoints() in src/lib/data/logs.ts. '
  'flash=4, 2-try=3, 3-try=2, 4+=1, incomplete=0, +1 if zone. '
  'NULL inputs score 0 (left-join safety).';

-- Pure helper — safe for every role.
grant execute on function public.compute_points(integer, boolean, boolean)
  to authenticated, anon, service_role;

-- ────────────────────────────────────────────────────────────────
-- Gym leaderboard RPCs (migration 008 bodies)
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
    where s.id = p_set_id
      and s.gym_id = p_gym_id
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
  limit least(coalesce(p_limit, 10), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

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
  limit least(coalesce(p_limit, 10), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

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
  join public.profiles p on p.id = r.user_id
  cross join anchor
  where r.rank between anchor.user_rank - 2 and anchor.user_rank + 2
  order by r.rank, p.username;
$$;

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

-- ────────────────────────────────────────────────────────────────
-- user_set_stats trigger sync (migration 013 body)
-- ────────────────────────────────────────────────────────────────

create or replace function public.sync_user_set_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_set_id  uuid;
  v_gym_id  uuid;
begin
  -- Determine affected (user, set) — always one pair per row event.
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = old.route_id;
  else
    v_user_id := new.user_id;
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = new.route_id;
  end if;

  -- Route might have been deleted already (ON DELETE CASCADE racing) —
  -- skip rather than raise.
  if v_set_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Recompute the pair from scratch — cheap (O(routes-in-set)) and
  -- avoids any risk of drift from partial maintenance logic.
  insert into public.user_set_stats (user_id, set_id, gym_id, sends, flashes, zones, points, updated_at)
  select
    v_user_id,
    v_set_id,
    v_gym_id,
    coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int,
    coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int,
    coalesce(sum(case when rl.zone then 1 else 0 end), 0)::int,
    coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone)), 0)::int,
    now()
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  where rl.user_id = v_user_id
    and r.set_id = v_set_id
  on conflict (user_id, set_id) do update
    set sends      = excluded.sends,
        flashes    = excluded.flashes,
        zones      = excluded.zones,
        points     = excluded.points,
        updated_at = now();

  -- If the recomputed row has nothing to show (no completed logs, no
  -- zones, no points) and no attempts either, clean it up so the table
  -- doesn't accumulate empty rows for users who tapped then undid.
  delete from public.user_set_stats uss
   where uss.user_id = v_user_id
     and uss.set_id  = v_set_id
     and uss.sends = 0
     and uss.flashes = 0
     and uss.zones = 0
     and uss.points = 0
     and not exists (
       select 1 from public.route_logs rl2
       join public.routes r2 on r2.id = rl2.route_id
       where rl2.user_id = v_user_id and r2.set_id = v_set_id
     );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- All-time profile stats (migration 042 body)
-- ────────────────────────────────────────────────────────────────

create or replace function public.get_user_all_time_stats(p_user_id uuid)
returns table (
  total_sends integer,
  total_flashes integer,
  total_zones integer,
  total_points integer,
  total_attempts integer,
  unique_routes_attempted integer,
  jams_played integer,
  jams_won integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with gym_agg as (
    select
      coalesce(sum(case when rl.completed then 1 else 0 end), 0)::integer as sends,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::integer as flashes,
      coalesce(sum(case when rl.zone then 1 else 0 end), 0)::integer as zones,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone)), 0)::integer as points,
      coalesce(sum(rl.attempts), 0)::integer as attempts,
      coalesce(count(distinct rl.route_id) filter (where rl.attempts > 0), 0)::integer as unique_routes
    from public.route_logs rl
    where rl.user_id = p_user_id
  ),
  jam_agg as (
    select
      coalesce(sum(jsp.sends), 0)::integer as sends,
      coalesce(sum(jsp.flashes), 0)::integer as flashes,
      coalesce(sum(jsp.zones), 0)::integer as zones,
      coalesce(sum(jsp.points), 0)::integer as points,
      coalesce(sum(jsp.attempts), 0)::integer as attempts,
      count(*)::integer as jams_played,
      coalesce(sum(case when jsp.is_winner then 1 else 0 end), 0)::integer as jams_won
    from public.jam_summary_players jsp
    where jsp.user_id = p_user_id
  )
  select
    (gym_agg.sends + jam_agg.sends)::integer,
    (gym_agg.flashes + jam_agg.flashes)::integer,
    (gym_agg.zones + jam_agg.zones)::integer,
    (gym_agg.points + jam_agg.points)::integer,
    (gym_agg.attempts + jam_agg.attempts)::integer,
    -- Jam routes aren't addressable across jams so we can't do a
    -- true union-count; use gym unique count + jams_played as a
    -- rough proxy. Good enough for the profile stat card.
    (gym_agg.unique_routes + jam_agg.jams_played)::integer,
    jam_agg.jams_played,
    jam_agg.jams_won
  from gym_agg, jam_agg;
$$;

-- ────────────────────────────────────────────────────────────────
-- end_jam (migration 050 body)
-- ────────────────────────────────────────────────────────────────

create or replace function public.end_jam(p_jam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  jam_row public.jams;
  summary_id uuid;
  duration_s integer;
  player_count_val integer;
  winner_id uuid;
  top_routes jsonb;
  grades_snapshot jsonb;
begin
  -- Lock the jam row for the duration of the transaction so no
  -- mutation (add_jam_route / upsert_jam_log / leave_jam) can slip
  -- in between the aggregations below.
  select * into jam_row
  from public.jams
  where id = p_jam_id
  for update;

  if jam_row.id is null then
    raise exception 'Jam not found' using errcode = 'P0002';
  end if;

  if jam_row.status = 'ended' then
    raise exception 'Jam already ended' using errcode = 'P0001';
  end if;

  -- Lock every jam_players row for this jam with FOR SHARE so a
  -- concurrent leave_jam can't change the player set between the
  -- `player_count_val` read and the `jam_summary_players` insert
  -- below.
  perform 1
  from public.jam_players
  where jam_id = p_jam_id
  for share;

  duration_s := greatest(
    extract(epoch from (now() - jam_row.started_at))::integer,
    1
  );

  select count(*) into player_count_val
  from public.jam_players
  where jam_id = p_jam_id
    and left_at is null;
  if player_count_val = 0 then
    player_count_val := 1;
  end if;

  select coalesce(jsonb_agg(route_row order by total_attempts desc nulls last), '[]'::jsonb)
    into top_routes
  from (
    select
      r.number,
      r.grade,
      r.has_zone,
      coalesce(sum(l.attempts), 0)::integer as total_attempts,
      coalesce(sum(case when l.completed then 1 else 0 end), 0)::integer as sends
    from public.jam_routes r
    left join public.jam_logs l on l.jam_route_id = r.id
    where r.jam_id = p_jam_id
    group by r.id, r.number, r.grade, r.has_zone
    order by total_attempts desc nulls last
    limit 5
  ) route_row;

  if jam_row.grading_scale = 'custom' then
    select coalesce(jsonb_agg(
      jsonb_build_object('ordinal', ordinal, 'label', label)
      order by ordinal
    ), '[]'::jsonb) into grades_snapshot
    from public.jam_grades
    where jam_id = p_jam_id;
  else
    grades_snapshot := null;
  end if;

  select user_id into winner_id
  from (
    select
      jp.user_id,
      coalesce(sum(public.compute_points(l.attempts, l.completed, l.zone)), 0) as points,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end), 0) as flashes,
      coalesce(sum(case when l.completed then 1 else 0 end), 0) as sends,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
    order by points desc, flashes desc, sends desc, last_send_at asc nulls last
    limit 1
  ) w;

  insert into public.jam_summaries (
    jam_id, name, location, host_id, grading_scale,
    started_at, ended_at, duration_seconds,
    player_count, winner_user_id, payload
  ) values (
    jam_row.id,
    jam_row.name,
    jam_row.location,
    jam_row.host_id,
    jam_row.grading_scale,
    jam_row.started_at,
    now(),
    duration_s,
    player_count_val,
    winner_id,
    jsonb_build_object(
      'grading_scale', jam_row.grading_scale,
      'min_grade', jam_row.min_grade,
      'max_grade', jam_row.max_grade,
      'grades', grades_snapshot,
      'top_routes', top_routes
    )
  )
  returning id into summary_id;

  -- Per-player summary rows — no `avatar_url` column. Avatars come
  -- from the live `profiles` join in `get_jam_summary`.
  insert into public.jam_summary_players (
    jam_summary_id, user_id, username, display_name,
    rank, sends, flashes, zones, points, attempts, is_winner
  )
  select
    summary_id,
    agg.user_id,
    coalesce(p.username, 'deleted'),
    coalesce(p.name, coalesce(p.username, 'deleted')),
    row_number() over (
      order by agg.points desc, agg.flashes desc, agg.sends desc,
               agg.last_send_at asc nulls last
    )::smallint,
    agg.sends,
    agg.flashes,
    agg.zones,
    agg.points,
    agg.attempts,
    agg.user_id = winner_id
  from (
    select
      jp.user_id,
      coalesce(sum(public.compute_points(l.attempts, l.completed, l.zone)), 0)::integer as points,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end), 0)::integer as flashes,
      coalesce(sum(case when l.completed then 1 else 0 end), 0)::integer as sends,
      coalesce(sum(case when l.zone then 1 else 0 end), 0)::integer as zones,
      coalesce(sum(l.attempts), 0)::integer as attempts,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
  ) agg
  left join public.profiles p on p.id = agg.user_id;

  -- Collapse — drop live jam rows. The summary + summary_players
  -- rows we just wrote are the permanent store.
  delete from public.jam_logs where jam_id = p_jam_id;
  delete from public.jam_routes where jam_id = p_jam_id;
  delete from public.jam_grades where jam_id = p_jam_id;
  delete from public.jam_players where jam_id = p_jam_id;
  delete from public.jams where id = p_jam_id;

  return summary_id;
end;
$$;

revoke execute on function public.end_jam(uuid) from authenticated, anon, public;
grant execute on function public.end_jam(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────
-- Live jam leaderboard (migration 056 body)
-- ────────────────────────────────────────────────────────────────

create or replace function public.get_jam_leaderboard(p_jam_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  sends smallint,
  flashes smallint,
  zones smallint,
  points smallint,
  attempts smallint,
  last_send_at timestamptz,
  rank smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select
      jp.user_id,
      coalesce(sum(case when l.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(public.compute_points(l.attempts, l.completed, l.zone))::smallint, 0::smallint) as points,
      coalesce(sum(l.attempts)::smallint, 0::smallint) as attempts,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l
      on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
  )
  select
    a.user_id,
    p.username,
    p.name as display_name,
    p.avatar_url,
    a.sends,
    a.flashes,
    a.zones,
    a.points,
    -- Privacy: own attempts pass through, every other player sees 0.
    -- Matches the pattern in get_jam_summary_for_user (migration 055).
    case when a.user_id = (select auth.uid()) then a.attempts else 0::smallint end as attempts,
    a.last_send_at,
    (dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last))::smallint as rank
  from agg a
  left join public.profiles p on p.id = a.user_id;
$$;

grant execute on function public.get_jam_leaderboard(uuid) to authenticated, service_role;
revoke execute on function public.get_jam_leaderboard(uuid) from anon, public;
