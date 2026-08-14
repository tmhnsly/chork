-- ────────────────────────────────────────────────────────────────
-- Set convergence, phase 2b: history, badges and the public result
-- ────────────────────────────────────────────────────────────────
--
-- Migration 084 covered running a Match. This covers everything that
-- reads one after it ends — the three surfaces still wired to the
-- `jam_summaries` family:
--
--   • the history list (`get_user_jams`)
--   • the badge context (`get_jam_achievement_context`)
--   • the public share card (`shared-result.ts`, which reads
--     `jam_summaries` + `jam_summary_players` by table)
--
-- All three exist because a jam was disposable: `end_jam` collapsed
-- it into a snapshot and deleted the live rows, so anything wanting
-- the result afterwards had to read the snapshot. A Match is a Set,
-- Sets keep their rows, and so every one of these now derives from
-- the same `route_logs` the live board reads.
--
-- That is what removes the last of the divergence recorded in
-- CONTEXT.md: `end_jam` wrote summary ranks with `row_number()`
-- (ties broken arbitrarily) while the live board used `dense_rank()`,
-- so a tied jam disagreed with itself depending on which screen you
-- were on. There is one ranking now, spelled once, below.

-- ── 1. The share capability moves to the Set ──────────────────────
--
-- Same design as migration 079, which put this on `jam_summaries`:
-- an unguessable token, minted only when a participant taps Share,
-- read through the service client so nothing is granted to `anon`.
-- Only its home changes.

alter table public.sets
  add column if not exists share_token text;

create unique index if not exists sets_share_token_key
  on public.sets (share_token)
  where share_token is not null;

comment on column public.sets.share_token is
  'Unguessable capability for the public result page (/r/<token>). '
  'Null until a player explicitly shares. Minted app-side; the public '
  'page reads via the service client, so no anon grant exists.';

-- ── 2. One ranking, spelled once ──────────────────────────────────
--
-- Every surface below ranks through this, so history, the live board
-- and the shared card cannot disagree. Mirrors
-- `get_match_leaderboard`'s aggregate and tiebreak exactly — points,
-- then flashes, then sends, then earliest last-send.
--
-- Deliberately NOT reading `user_set_stats`: that table is a cache
-- keyed on (user, set) with no `last_send_at`, so ranking from it
-- would drop the fourth tiebreak column and reintroduce exactly the
-- tie disagreement this migration exists to remove.
create or replace function public.match_standings(p_set_id uuid)
returns table (
  user_id uuid,
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
      sp.user_id as player_id,
      coalesce(sum(case when rl.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when rl.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone))::smallint, 0::smallint) as points,
      coalesce(sum(rl.attempts)::smallint, 0::smallint) as attempts,
      max(rl.completed_at) as last_send_at
    from public.set_players sp
    left join public.route_logs rl
      on rl.user_id = sp.user_id and rl.set_id = sp.set_id
    where sp.set_id = p_set_id
      and sp.left_at is null
    group by sp.user_id
  )
  select
    a.player_id,
    a.sends,
    a.flashes,
    a.zones,
    a.points,
    a.attempts,
    a.last_send_at,
    (dense_rank() over (
      order by a.points desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last
    ))::smallint
  from agg a;
$$;

-- Raw, unmasked attempts: every caller below either masks or drops
-- them. Never grant this to a client.
revoke execute on function public.match_standings(uuid) from anon, authenticated, public;

-- ── 3. History ────────────────────────────────────────────────────

create or replace function public.get_match_history(
  p_user_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  set_id uuid,
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
  with mine as (
    select s.id, s.name, s.location, s.starts_at, s.ends_at
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id and sp.user_id = p_user_id and sp.left_at is null
    where s.owner_kind = 'climber'
      and s.status = 'archived'
      and s.ends_at is not null
      and (p_before is null or s.ends_at < p_before)
    order by s.ends_at desc
    limit least(coalesce(p_limit, 20), 100)
  ),
  standings as (
    select m.id as set_id, st.*
    from mine m
    cross join lateral public.match_standings(m.id) st
  ),
  winner as (
    select distinct on (sd.set_id)
      sd.set_id, sd.user_id, p.username, p.name as display_name
    from standings sd
    left join public.profiles p on p.id = sd.user_id
    where sd.rank = 1
    -- A tie at the top is possible; pick one deterministically for
    -- the "won by" line rather than showing whichever row sorted
    -- first today. `user_is_winner` below stays true for BOTH, so
    -- nobody loses their win to this tiebreak.
    order by sd.set_id, sd.user_id
  )
  select
    m.id,
    m.name,
    m.location,
    m.ends_at,
    m.starts_at,
    greatest(extract(epoch from (m.ends_at - m.starts_at))::integer, 0),
    (select count(*)::smallint from public.set_players sp
      where sp.set_id = m.id and sp.left_at is null),
    mine_st.rank,
    mine_st.sends,
    mine_st.flashes,
    mine_st.points,
    (mine_st.rank = 1),
    w.user_id,
    w.username,
    w.display_name
  from mine m
  join standings mine_st
    on mine_st.set_id = m.id and mine_st.user_id = p_user_id
  left join winner w on w.set_id = m.id
  order by m.ends_at desc;
$$;

-- Service-role only: it takes the subject as an argument, so a client
-- could otherwise read anyone's history.
revoke execute on function public.get_match_history(uuid, integer, timestamptz) from anon, authenticated, public;
grant execute on function public.get_match_history(uuid, integer, timestamptz) to service_role;

-- ── 4. Badge context ──────────────────────────────────────────────
--
-- Same nine numbers as `get_jam_achievement_context`, derived from
-- the live rows instead of the summary snapshot.

create or replace function public.get_match_achievement_context(p_user_id uuid)
returns table (
  matches_played bigint,
  matches_won bigint,
  matches_hosted bigint,
  max_players_in_won_match bigint,
  unique_coplayers bigint,
  max_iron_crew_pair_count bigint,
  match_total_flashes bigint,
  match_total_sends bigint,
  match_total_points bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with played as (
    select s.id, s.host_id
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id and sp.user_id = p_user_id and sp.left_at is null
    where s.owner_kind = 'climber'
      and s.status = 'archived'
  ),
  standings as (
    select pl.id as set_id, st.*
    from played pl
    cross join lateral public.match_standings(pl.id) st
  ),
  mine as (
    select sd.set_id, sd.rank, sd.sends, sd.flashes, sd.points
    from standings sd
    where sd.user_id = p_user_id
  ),
  won as (
    select m.set_id from mine m where m.rank = 1
  ),
  coplayers as (
    select sp.user_id, count(*) as together
    from played pl
    join public.set_players sp
      on sp.set_id = pl.id and sp.left_at is null
    where sp.user_id <> p_user_id
    group by sp.user_id
  )
  select
    (select count(*) from played),
    (select count(*) from won),
    (select count(*) from played where host_id = p_user_id),
    coalesce((
      select max(cnt) from (
        select count(*) as cnt
        from public.set_players sp
        where sp.set_id in (select set_id from won) and sp.left_at is null
        group by sp.set_id
      ) w
    ), 0),
    (select count(*) from coplayers),
    coalesce((select max(together) from coplayers), 0),
    coalesce((select sum(flashes) from mine), 0),
    coalesce((select sum(sends) from mine), 0),
    coalesce((select sum(points) from mine), 0);
$$;

revoke execute on function public.get_match_achievement_context(uuid) from anon, authenticated, public;
grant execute on function public.get_match_achievement_context(uuid) to service_role;

-- ── 5. The public result ──────────────────────────────────────────
--
-- Whatever this returns is public to anyone holding the link, so
-- `attempts` is not merely masked here — it is absent from the return
-- shape entirely. There is no viewer to mask against on a public
-- page, and a column that cannot be selected cannot leak. See
-- CONTEXT.md "Attempt privacy" and attempt-privacy.test.ts.

create or replace function public.get_public_match_result(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  set_row public.sets;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,64}$' then
    return null;
  end if;

  select * into set_row
  from public.sets
  where share_token = p_token
    and owner_kind = 'climber';

  if set_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'set_id', set_row.id,
    'name', set_row.name,
    'location', set_row.location,
    'started_at', set_row.starts_at,
    'ended_at', set_row.ends_at,
    'status', set_row.status,
    'player_count', (
      select count(*) from public.set_players sp
      where sp.set_id = set_row.id and sp.left_at is null
    ),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rank', st.rank,
          'display_name', p.name,
          'username', p.username,
          'points', st.points,
          'sends', st.sends,
          'flashes', st.flashes,
          'zones', st.zones,
          'is_winner', (st.rank = 1)
          -- `attempts` is deliberately absent. Do not add it.
        )
        order by st.rank, p.username
      )
      from public.match_standings(set_row.id) st
      left join public.profiles p on p.id = st.user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_public_match_result(text) from anon, authenticated, public;
grant execute on function public.get_public_match_result(text) to service_role;

-- ── 6. Realtime ───────────────────────────────────────────────────
--
-- The live room needs the same three streams the jam had. Filters
-- are on `set_id`, which 080 denormalised onto `route_logs` for
-- exactly this kind of use.
--
-- `REPLICA IDENTITY FULL` is what makes DELETE events carry the old
-- row, which the client needs to un-paint a removed tile. It costs a
-- full old-row copy into the WAL on every UPDATE, and `route_logs` is
-- upserted on every send in the gym — so this deliberately lands with
-- the UI that uses it, not earlier.

alter table public.routes replica identity full;
alter table public.route_logs replica identity full;
alter table public.set_players replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'routes'
  ) then
    alter publication supabase_realtime add table public.routes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'route_logs'
  ) then
    alter publication supabase_realtime add table public.route_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'set_players'
  ) then
    alter publication supabase_realtime add table public.set_players;
  end if;
end;
$$;

-- ── 7. Carry the one real jam across ──────────────────────────────
--
-- Production holds exactly one `jam_summaries` row — a real session
-- ("Portland Saturday", one player, one route), whose `jams` row
-- `end_jam` already deleted. It is the only Match data that has ever
-- existed here, and it is somebody's history, so it is rebuilt as an
-- archived Set rather than dropped with the table.
--
-- Only summaries with a recoverable shape are carried: `payload ->
-- top_routes` holds each route's number, grade, zone flag, send count
-- and total attempts, which is enough to reconstruct the routes and,
-- for a single-player session, that player's logs exactly. Anything
-- multi-player cannot be split back into per-player logs from an
-- aggregate — for those the Set and its players are recreated with no
-- logs, so the session still appears in history with its date, name
-- and roster, and only the per-route detail is lost. Nothing is
-- deleted here either way; `jam_summaries` still holds the original.

do $$
declare
  summary record;
  route_json jsonb;
  new_set_id uuid;
  new_route_id uuid;
  player_count integer;
  solo_player uuid;
begin
  for summary in
    select s.*, (
      select count(*) from public.jam_summary_players sp
      where sp.jam_summary_id = s.id and sp.user_id is not null
    ) as live_players
    from public.jam_summaries s
  loop
    -- Idempotent: a re-run must not duplicate the Set.
    if exists (
      select 1 from public.sets
      where owner_kind = 'climber'
        and name is not distinct from summary.name
        and starts_at = summary.started_at
        and ends_at = summary.ended_at
    ) then
      continue;
    end if;

    if summary.host_id is null then
      continue;
    end if;

    insert into public.sets (
      owner_kind, host_id, gym_id, code, name, location,
      grading_scale, min_grade, max_grade,
      status, starts_at, ends_at, last_activity_at
    ) values (
      'climber',
      summary.host_id,
      null,
      public.generate_set_code(),
      summary.name,
      summary.location,
      summary.grading_scale,
      (summary.payload ->> 'min_grade')::smallint,
      (summary.payload ->> 'max_grade')::smallint,
      'archived',
      summary.started_at,
      summary.ended_at,
      summary.ended_at
    )
    returning id into new_set_id;

    insert into public.set_players (set_id, user_id, joined_at, is_host)
    select new_set_id, sp.user_id, summary.started_at,
           (sp.user_id = summary.host_id)
    from public.jam_summary_players sp
    where sp.jam_summary_id = summary.id
      and sp.user_id is not null;

    player_count := summary.live_players;

    select sp.user_id into solo_player
    from public.jam_summary_players sp
    where sp.jam_summary_id = summary.id and sp.user_id is not null
    limit 1;

    for route_json in
      select jsonb_array_elements(coalesce(summary.payload -> 'top_routes', '[]'::jsonb))
    loop
      insert into public.routes (
        set_id, number, has_zone, declared_grade, added_by, created_at
      ) values (
        new_set_id,
        (route_json ->> 'number')::integer,
        coalesce((route_json ->> 'has_zone')::boolean, false),
        (route_json ->> 'grade')::smallint,
        summary.host_id,
        summary.started_at
      )
      returning id into new_route_id;

      -- Per-player logs are only recoverable when there was one
      -- player: with more, `total_attempts` is a sum nobody can
      -- attribute. The trigger from 081 fills `set_id`.
      if player_count = 1 and solo_player is not null then
        insert into public.route_logs (
          user_id, route_id, gym_id, attempts, completed, completed_at, zone
        ) values (
          solo_player,
          new_route_id,
          null,
          coalesce((route_json ->> 'total_attempts')::integer, 0),
          coalesce((route_json ->> 'sends')::integer, 0) > 0,
          case when coalesce((route_json ->> 'sends')::integer, 0) > 0
               then summary.ended_at else null end,
          false
        );
      end if;
    end loop;
  end loop;
end;
$$;
