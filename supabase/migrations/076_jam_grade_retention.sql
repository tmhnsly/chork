-- 076: keep a per-grade record of what each climber sent in a jam
--
-- `end_jam` collapses a finished jam to a summary and deletes the live
-- rows, targeting ~1KB per completed jam. What survived was
-- `jam_summary_players` (one row per climber: sends, flashes, zones,
-- points, attempts) plus a `top_routes` payload holding the five
-- most-attempted routes **aggregated across the whole field**.
--
-- That ranks a jam and not much else. It cannot answer "which grades
-- has this climber sent", because the only surviving grade data is
-- pooled across every player, and `jam_logs` — the one place tying a
-- climber to a route — was deleted. The gap is one-way: gym sends keep
-- full grade history forever (`route_logs` are never deleted and
-- `routes.community_grade` is denormalised), so a grade breakdown was
-- buildable for gym climbers and impossible for jam climbers. That is
-- backwards for an app whose premise is that a gym is optional.
--
-- Nothing here can be backfilled. Every jam that has already ended has
-- lost this permanently; this migration only stops the loss going
-- forward, which is why it ships ahead of anything that reads it.
--
-- WHAT IS STORED, AND WHY THAT SHAPE
--
-- One row per (climber, grade) rather than per route. The row count is
-- bounded by distinct grades in the jam — call it 6-15 — instead of by
-- routes × players, so a 10-player 20-route jam costs ~60 tiny rows
-- instead of ~200, and the cost stays flat as jams get bigger. Losing
-- per-route detail is deliberate: "hardest grade sent" is still
-- derivable as max(grade) where sends > 0, and per-route jam history
-- isn't a feature anyone has asked for.
--
-- Attempts are deliberately NOT stored here. Attempt counts are
-- private (CLAUDE.md, "Domain rules") and this table is readable by
-- every signed-in user, so leaving the column out removes the problem
-- rather than creating something to police. Sends and flashes are
-- achievements, and are already public on the Chorkboard.
--
-- Only `v` / `font` jams contribute grade rows. A `custom` scale is a
-- per-jam ordinal ladder with arbitrary labels ("easy/medium/hard",
-- colours, whatever the host typed), so ordinal 4 in one jam has no
-- relationship to ordinal 4 in another, let alone to a V-grade. Those
-- sends are counted in `ungraded_sends` below instead, so a future
-- graph can say what it excluded rather than silently under-reporting
-- someone's session.

create table public.jam_summary_grades (
  jam_summary_id uuid not null
    references public.jam_summaries(id) on delete cascade,
  -- NOT NULL + cascade, unlike `jam_summary_players.user_id`, which is
  -- `on delete set null` while also sitting in that table's primary
  -- key — a combination Postgres cannot satisfy. Nobody needs a
  -- deleted climber's grade pyramid, so cascading is both correct and
  -- avoids repeating that shape.
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  -- Same 0-30 encoding as `route_logs.grade_vote` and `jams.min_grade`
  -- / `max_grade`. The scale it should be read against lives on the
  -- parent `jam_summaries.grading_scale`, so it is never ambiguous and
  -- never duplicated per row.
  grade smallint not null check (grade between 0 and 30),
  sends smallint not null default 0 check (sends >= 0),
  flashes smallint not null default 0 check (flashes >= 0),
  -- Zones on *sent* routes. `jam_summary_players.zones` counts any
  -- zone whether or not the route went, but this table describes a
  -- distribution of completions, so a zone on an unsent route has no
  -- grade bar to belong to.
  zones smallint not null default 0 check (zones >= 0),
  primary key (jam_summary_id, user_id, grade)
);

-- The read this exists to serve: every grade row for one climber,
-- across every jam they've played.
create index jam_summary_grades_user_idx
  on public.jam_summary_grades (user_id, grade);

alter table public.jam_summary_grades enable row level security;

-- Matches `jam_summary_players`: jam history is public within the app.
-- Grades-you-have-sent is an achievement, the same class of fact as
-- the points already on the public leaderboard.
create policy jam_summary_grades_select on public.jam_summary_grades
  for select to authenticated
  using (true);

-- No write policy on purpose. The only writer is `end_jam`, which is
-- SECURITY DEFINER and therefore bypasses RLS — same as the existing
-- summary tables. A climber must not be able to author their own
-- history.

-- RLS is not enough on its own: without a table-level grant the Data
-- API can't reach the table at all from supabase-js. See CLAUDE.md,
-- "New tables need an explicit Data API grant".
grant select on public.jam_summary_grades to authenticated;

-- Sends that could not be placed on a grade axis — a custom-scale jam,
-- or a route nobody bothered to grade. Lives on the player row rather
-- than as a null-grade row in `jam_summary_grades`, because a nullable
-- `grade` cannot sit in that table's primary key.
alter table public.jam_summary_players
  add column if not exists ungraded_sends smallint not null default 0
    check (ungraded_sends >= 0);

-- ── end_jam ──────────────────────────────────────────────────────
--
-- Unchanged from 063 except for two additions, both placed before the
-- deletes: `ungraded_sends` on the player insert, and the new
-- per-grade rollup. The ordering matters — every aggregate below reads
-- `jam_logs` / `jam_routes`, which the collapse at the end destroys.
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
    rank, sends, flashes, zones, points, attempts, is_winner,
    ungraded_sends
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
    agg.user_id = winner_id,
    agg.ungraded_sends
  from (
    select
      jp.user_id,
      coalesce(sum(public.compute_points(l.attempts, l.completed, l.zone)), 0)::integer as points,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end), 0)::integer as flashes,
      coalesce(sum(case when l.completed then 1 else 0 end), 0)::integer as sends,
      coalesce(sum(case when l.zone then 1 else 0 end), 0)::integer as zones,
      coalesce(sum(l.attempts), 0)::integer as attempts,
      -- Sends with nowhere to sit on a grade axis. The join to
      -- `jam_routes` is many-to-one, so it can't multiply rows and the
      -- aggregates above are unaffected.
      coalesce(sum(case
        when l.completed
         and (r.grade is null or jam_row.grading_scale not in ('v', 'font'))
        then 1 else 0
      end), 0)::integer as ungraded_sends,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    left join public.jam_routes r on r.id = l.jam_route_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
  ) agg
  left join public.profiles p on p.id = agg.user_id;

  -- Per-climber × per-grade rollup. Sends only: this is a distribution
  -- of completions, and an unsent route has no bar to belong to.
  --
  -- Skipped entirely for `custom` scales — those ordinals aren't
  -- comparable between jams, so writing them would put meaningless
  -- numbers on a shared axis. They're counted in `ungraded_sends`
  -- above instead.
  if jam_row.grading_scale in ('v', 'font') then
    insert into public.jam_summary_grades (
      jam_summary_id, user_id, grade, sends, flashes, zones
    )
    select
      summary_id,
      l.user_id,
      r.grade,
      count(*)::smallint,
      count(*) filter (where l.attempts = 1)::smallint,
      count(*) filter (where l.zone)::smallint
    from public.jam_logs l
    join public.jam_routes r on r.id = l.jam_route_id
    join public.jam_players jp
      on jp.jam_id = l.jam_id and jp.user_id = l.user_id
    where l.jam_id = p_jam_id
      and l.completed
      and r.grade is not null
      -- Same population as every other aggregate here: a climber who
      -- left the jam isn't in the summary, so they get no grade rows.
      and jp.left_at is null
    group by l.user_id, r.grade;
  end if;

  -- Collapse — drop live jam rows. The summary + summary_players
  -- + summary_grades rows we just wrote are the permanent store.
  delete from public.jam_logs where jam_id = p_jam_id;
  delete from public.jam_routes where jam_id = p_jam_id;
  delete from public.jam_grades where jam_id = p_jam_id;
  delete from public.jam_players where jam_id = p_jam_id;
  delete from public.jams where id = p_jam_id;

  return summary_id;
end;
$$;

-- `create or replace` preserves privileges, so these are strictly
-- belt-and-braces — but every prior redefinition of this function
-- restates them, which keeps the intended grant visible in the
-- migration that last touched it rather than only in migration 047.
revoke execute on function public.end_jam(uuid) from authenticated, anon, public;
grant execute on function public.end_jam(uuid) to service_role;
