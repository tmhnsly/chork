-- Jam summaries + end_jam transaction + abandoned-jam sweep.
-- Companion to migration 041 which created the live jam tables.
--
-- Storage design: on jam end, the per-attempt data (jam_logs +
-- jam_routes + jam_grades + jam_players) collapses into a compact
-- summary + per-player roll-up. Live rows are deleted in the same
-- transaction. Target: ~1KB per completed jam, independent of how
-- many routes or attempts there were.

-- ── Summary tables ────────────────────────────────

-- Permanent historical record. jam_id is retained as a stable id
-- even though the originating jams row is deleted by end_jam.
create table public.jam_summaries (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null unique,
  name text,
  location text,
  host_id uuid references public.profiles(id) on delete set null,
  grading_scale text not null check (grading_scale in ('v', 'font', 'custom')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null,
  player_count smallint not null check (player_count between 1 and 20),
  winner_user_id uuid references public.profiles(id) on delete set null,
  -- Opaque payload: top routes, grade snapshot, enrichment data.
  -- Shape documented in docs/jams-plan.md §3.6.
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index jam_summaries_created_at_idx on public.jam_summaries (created_at desc);
create index jam_summaries_host_id_idx on public.jam_summaries (host_id);
create index jam_summaries_winner_idx on public.jam_summaries (winner_user_id)
  where winner_user_id is not null;

-- Normalised per-player aggregates. Lets "all jams user X has
-- played" be a direct join instead of jsonb unpack. Columns are
-- denormalised snapshots so the history stays readable after a
-- user deletes their account or renames their handle.
create table public.jam_summary_players (
  jam_summary_id uuid not null references public.jam_summaries(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  rank smallint not null check (rank >= 1),
  sends smallint not null check (sends >= 0),
  flashes smallint not null check (flashes >= 0),
  zones smallint not null check (zones >= 0),
  points smallint not null check (points >= 0),
  attempts smallint not null check (attempts >= 0),
  is_winner boolean not null default false,
  display_name text not null,
  username text not null,
  primary key (jam_summary_id, user_id)
);

create index jam_summary_players_user_id_idx
  on public.jam_summary_players (user_id, jam_summary_id);

alter table public.jam_summaries enable row level security;
alter table public.jam_summary_players enable row level security;

-- Summaries are public within the app — profile jam history is
-- visible to any authenticated user viewing a climber's profile.
-- No write policies: inserts happen inside end_jam (SECURITY DEFINER).
create policy jam_summaries_select on public.jam_summaries
  for select to authenticated
  using (true);

create policy jam_summary_players_select on public.jam_summary_players
  for select to authenticated
  using (true);

-- ── end_jam ───────────────────────────────────────
-- Atomic: aggregate → insert summary → insert per-player → delete
-- live rows → return the new summary id. Called from the
-- endJamAction server action, which wraps in try/catch for the
-- achievement re-evaluation via after().

create or replace function public.end_jam(p_jam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  jam_row public.jams;
  new_summary_id uuid;
  winner_id uuid;
  top_routes jsonb;
  grades_snapshot jsonb;
  duration_s integer;
  player_count_val smallint;
begin
  select * into jam_row from public.jams where id = p_jam_id for update;
  if jam_row.id is null then
    raise exception 'Jam not found' using errcode = 'P0002';
  end if;
  if jam_row.status <> 'live' then
    raise exception 'Jam already ended' using errcode = 'P0001';
  end if;

  duration_s := greatest(
    1,
    extract(epoch from (now() - jam_row.started_at))::integer
  );

  -- Aggregate per-player in one CTE chain, same tiebreak as the
  -- live leaderboard RPC.
  with player_totals as (
    select
      jp.user_id,
      p.username,
      p.name as display_name,
      coalesce(sum(case when l.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(
        case
          when l.completed and l.attempts = 1 then 4
          when l.completed and l.attempts = 2 then 3
          when l.completed and l.attempts = 3 then 2
          when l.completed and l.attempts >= 4 then 1
          else 0
        end
      )::smallint, 0::smallint)
      + coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as points,
      coalesce(sum(l.attempts)::smallint, 0::smallint) as attempts,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.profiles p on p.id = jp.user_id
    left join public.jam_logs l on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id, p.username, p.name
  ),
  ranked as (
    select *,
      (dense_rank() over (order by points desc, flashes desc, sends desc, last_send_at asc nulls last))::smallint as rank
    from player_totals
  )
  select count(*)::smallint into player_count_val from ranked;

  if player_count_val = 0 then
    -- Empty jam — no players or all left. Fall back to a 1-slot
    -- summary for the host so we have provenance in history.
    player_count_val := 1;
  end if;

  -- Top 5 routes by total attempts, for the summary payload.
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

  -- Grade snapshot for custom scales, null otherwise.
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

  -- Recompute the winner from the aggregate (single-statement
  -- fallback so we don't re-query the CTE twice).
  select user_id into winner_id
  from (
    select
      jp.user_id,
      coalesce(sum(
        case
          when l.completed and l.attempts = 1 then 4
          when l.completed and l.attempts = 2 then 3
          when l.completed and l.attempts = 3 then 2
          when l.completed and l.attempts >= 4 then 1
          else 0
        end
      ), 0)
      + coalesce(sum(case when l.zone then 1 else 0 end), 0) as points,
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

  -- Insert the summary.
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
  returning id into new_summary_id;

  -- Insert one row per player with their final stats.
  insert into public.jam_summary_players (
    jam_summary_id, user_id, rank, sends, flashes, zones, points, attempts,
    is_winner, display_name, username
  )
  select
    new_summary_id,
    pt.user_id,
    pt.rank,
    pt.sends,
    pt.flashes,
    pt.zones,
    pt.points,
    pt.attempts,
    (pt.user_id = winner_id) as is_winner,
    coalesce(pt.display_name, 'Unknown climber'),
    coalesce(pt.username, 'deleted')
  from (
    select
      jp.user_id,
      p.username,
      p.name as display_name,
      coalesce(sum(case when l.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(
        case
          when l.completed and l.attempts = 1 then 4
          when l.completed and l.attempts = 2 then 3
          when l.completed and l.attempts = 3 then 2
          when l.completed and l.attempts >= 4 then 1
          else 0
        end
      )::smallint, 0::smallint)
      + coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as points,
      coalesce(sum(l.attempts)::smallint, 0::smallint) as attempts,
      max(l.completed_at) as last_send_at,
      (dense_rank() over (order by
        coalesce(sum(
          case
            when l.completed and l.attempts = 1 then 4
            when l.completed and l.attempts = 2 then 3
            when l.completed and l.attempts = 3 then 2
            when l.completed and l.attempts >= 4 then 1
            else 0
          end
        ), 0)
        + coalesce(sum(case when l.zone then 1 else 0 end), 0) desc,
        coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end), 0) desc,
        coalesce(sum(case when l.completed then 1 else 0 end), 0) desc,
        max(l.completed_at) asc nulls last
      ))::smallint as rank
    from public.jam_players jp
    left join public.profiles p on p.id = jp.user_id
    left join public.jam_logs l on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id, p.username, p.name
  ) pt;

  -- Collapse the live rows. Ordered to respect FK cascades cleanly.
  delete from public.jam_logs where jam_id = p_jam_id;
  delete from public.jam_routes where jam_id = p_jam_id;
  delete from public.jam_grades where jam_id = p_jam_id;
  delete from public.jam_players where jam_id = p_jam_id;

  -- Flip status on the jams row, then delete it — preserves the
  -- unique-code constraint from being reused while still letting
  -- the shell go back to zero storage cost.
  update public.jams set status = 'ended', ended_at = now() where id = p_jam_id;
  delete from public.jams where id = p_jam_id;

  return new_summary_id;
end;
$$;

-- end_jam is invoked via the server action which uses service-role.
-- It's gated inside the function body but exposed to authenticated
-- as well so we don't need to round-trip through the service client
-- for normal "host/player ends jam" flows.
grant execute on function public.end_jam(uuid) to authenticated;
revoke execute on function public.end_jam(uuid) from anon, public;

-- Wrapper that enforces the caller is a player of the jam. Keeps
-- the actual end_jam logic callable by end_stale_jams (service role)
-- without an auth gate, while the public entry-point requires it.
create or replace function public.end_jam_as_player(p_jam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_jam_player(p_jam_id) then
    raise exception 'Not a player in this jam' using errcode = '42501';
  end if;
  return public.end_jam(p_jam_id);
end;
$$;

grant execute on function public.end_jam_as_player(uuid) to authenticated;
revoke execute on function public.end_jam_as_player(uuid) from anon, public;

-- ── Abandoned-jam sweep ───────────────────────────

create or replace function public.end_stale_jams()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  closed_count integer := 0;
begin
  for target in
    select id from public.jams
     where status = 'live'
       and last_activity_at < now() - interval '24 hours'
  loop
    begin
      perform public.end_jam(target.id);
      closed_count := closed_count + 1;
    exception
      when others then
        -- Don't let one bad jam wedge the whole sweep.
        raise warning 'end_stale_jams: failed to close jam %: %', target.id, sqlerrm;
    end;
  end loop;
  return closed_count;
end;
$$;

revoke execute on function public.end_stale_jams() from public, anon, authenticated;
grant execute on function public.end_stale_jams() to service_role;

-- pg_cron schedule — hourly sweep. pg_cron extension is already
-- present (migration 015 enabled it for auto_publish_due_sets).
select cron.schedule(
  'end_stale_jams',
  '0 * * * *',
  $$ select public.end_stale_jams(); $$
);

-- ── History reads ─────────────────────────────────

-- get_user_jams: paginated jam history for a user. Used by the
-- profile jams section and the /jam recent list (with different
-- limits). Cursor = ended_at desc.
create or replace function public.get_user_jams(
  p_user_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  summary_id uuid,
  jam_id uuid,
  name text,
  location text,
  ended_at timestamptz,
  started_at timestamptz,
  duration_seconds integer,
  player_count smallint,
  user_rank smallint,
  user_sends smallint,
  user_flashes smallint,
  user_points smallint,
  user_is_winner boolean,
  winner_user_id uuid,
  winner_username text,
  winner_display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id as summary_id,
    s.jam_id,
    s.name,
    s.location,
    s.ended_at,
    s.started_at,
    s.duration_seconds,
    s.player_count,
    jsp.rank as user_rank,
    jsp.sends as user_sends,
    jsp.flashes as user_flashes,
    jsp.points as user_points,
    jsp.is_winner as user_is_winner,
    s.winner_user_id,
    winner.username as winner_username,
    winner.name as winner_display_name
  from public.jam_summaries s
  join public.jam_summary_players jsp
    on jsp.jam_summary_id = s.id and jsp.user_id = p_user_id
  left join public.profiles winner on winner.id = s.winner_user_id
  where (p_before is null or s.ended_at < p_before)
  order by s.ended_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;

grant execute on function public.get_user_jams(uuid, integer, timestamptz) to authenticated;
revoke execute on function public.get_user_jams(uuid, integer, timestamptz) from anon, public;

-- get_jam_summary: full detail for a single completed jam.
create or replace function public.get_jam_summary(p_summary_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'summary', to_jsonb(s),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', jsp.user_id,
          'username', jsp.username,
          'display_name', jsp.display_name,
          'rank', jsp.rank,
          'sends', jsp.sends,
          'flashes', jsp.flashes,
          'zones', jsp.zones,
          'points', jsp.points,
          'attempts', jsp.attempts,
          'is_winner', jsp.is_winner,
          'avatar_url', p.avatar_url
        )
        order by jsp.rank
      )
      from public.jam_summary_players jsp
      left join public.profiles p on p.id = jsp.user_id
      where jsp.jam_summary_id = s.id
    ), '[]'::jsonb)
  )
  from public.jam_summaries s
  where s.id = p_summary_id
  limit 1;
$$;

grant execute on function public.get_jam_summary(uuid) to authenticated;
revoke execute on function public.get_jam_summary(uuid) from anon, public;

-- ── Unified all-time stats (cross-source) ─────────
-- For gymless profile views and any future "lifetime" panel.
-- Unions gym route_logs + jam_summary_players; jam totals come
-- from the summary (post-jam) not live jam_logs, so the numbers
-- are stable regardless of whether a jam is currently running.

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
      coalesce(sum(
        case
          when rl.completed and rl.attempts = 1 then 4
          when rl.completed and rl.attempts = 2 then 3
          when rl.completed and rl.attempts = 3 then 2
          when rl.completed and rl.attempts >= 4 then 1
          else 0
        end
      ), 0)::integer
      + coalesce(sum(case when rl.zone then 1 else 0 end), 0)::integer as points,
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

grant execute on function public.get_user_all_time_stats(uuid) to authenticated;
revoke execute on function public.get_user_all_time_stats(uuid) from anon, public;

-- ── Achievement context helper ────────────────────
-- Returns the jam-specific counters buildBadgeContext() needs to
-- evaluate the 8 new jam badges. Everything comes from
-- jam_summaries + jam_summary_players (post-jam state). Live jams
-- don't affect badge evaluation — achievements fire at jam end.

create or replace function public.get_jam_achievement_context(p_user_id uuid)
returns table (
  jams_played integer,
  jams_won integer,
  jams_hosted integer,
  max_players_in_won_jam integer,
  unique_coplayers integer,
  max_iron_crew_pair_count integer,
  jam_total_flashes integer,
  jam_total_sends integer,
  jam_total_points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with self_summaries as (
    select s.id, s.player_count, s.host_id, jsp.is_winner
    from public.jam_summaries s
    join public.jam_summary_players jsp
      on jsp.jam_summary_id = s.id and jsp.user_id = p_user_id
  ),
  -- Co-players across all jams the user played in.
  coplayers as (
    select distinct jsp.user_id
    from self_summaries ss
    join public.jam_summary_players jsp
      on jsp.jam_summary_id = ss.id
    where jsp.user_id is not null
      and jsp.user_id <> p_user_id
  ),
  -- Per jam, the set of co-players excluding self.
  jam_mates as (
    select ss.id as summary_id, jsp.user_id as mate_id
    from self_summaries ss
    join public.jam_summary_players jsp
      on jsp.jam_summary_id = ss.id
    where jsp.user_id is not null
      and jsp.user_id <> p_user_id
  ),
  -- Pairs of co-players that appeared in the same jam as self.
  -- "10 jams with the same 3 people" approximated by the max
  -- count of any single pair of mates that both played alongside
  -- self — tractable compute and matches the intent for small
  -- friend groups.
  mate_pairs as (
    select a.summary_id, a.mate_id as mate_a, b.mate_id as mate_b
    from jam_mates a
    join jam_mates b
      on a.summary_id = b.summary_id
     and a.mate_id < b.mate_id
  ),
  pair_counts as (
    select mate_a, mate_b, count(*) as shared_jams
    from mate_pairs
    group by mate_a, mate_b
  )
  select
    (select count(*)::integer from self_summaries) as jams_played,
    (select count(*)::integer from self_summaries where is_winner) as jams_won,
    (
      select count(*)::integer
      from self_summaries
      where host_id = p_user_id
    ) as jams_hosted,
    coalesce((
      select max(player_count)::integer
      from self_summaries
      where is_winner
    ), 0) as max_players_in_won_jam,
    (select count(*)::integer from coplayers) as unique_coplayers,
    coalesce((select max(shared_jams)::integer from pair_counts), 0) as max_iron_crew_pair_count,
    -- Jam-side totals folded into progress badges (Thunder /
    -- First (A)send / Century) so a gymless climber still
    -- progresses the flash + send ladders.
    coalesce((
      select sum(jsp.flashes)::integer
      from public.jam_summary_players jsp
      where jsp.user_id = p_user_id
    ), 0) as jam_total_flashes,
    coalesce((
      select sum(jsp.sends)::integer
      from public.jam_summary_players jsp
      where jsp.user_id = p_user_id
    ), 0) as jam_total_sends,
    coalesce((
      select sum(jsp.points)::integer
      from public.jam_summary_players jsp
      where jsp.user_id = p_user_id
    ), 0) as jam_total_points;
$$;

grant execute on function public.get_jam_achievement_context(uuid) to authenticated;
revoke execute on function public.get_jam_achievement_context(uuid) from anon, public;

-- get_user_saved_scales: returns the caller's saved custom scales
-- with their grade labels. Used by the create-jam scale picker.

create or replace function public.get_user_saved_scales()
returns table (
  id uuid,
  name text,
  grades jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', g.ordinal, 'label', g.label)
        order by g.ordinal
      )
      from public.user_custom_scale_grades g
      where g.scale_id = s.id
    ), '[]'::jsonb) as grades,
    s.created_at
  from public.user_custom_scales s
  where s.user_id = (select auth.uid())
  order by s.created_at desc;
$$;

grant execute on function public.get_user_saved_scales() to authenticated;
revoke execute on function public.get_user_saved_scales() from anon, public;
