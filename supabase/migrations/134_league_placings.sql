-- ────────────────────────────────────────────────────────────────
-- League: a week's placings are spelled once
-- ────────────────────────────────────────────────────────────────
--
-- 133's pre-merge review found the same shape of bug twice, because
-- Chork's "fewest letters wins, anyone out is behind everyone still
-- standing" ordering was open-coded in two places and had already
-- drifted between them:
--
--   1. `get_league`'s `winner_user_id` filtered
--      `cs.user_id is not null` BEFORE ordering by `is_out, letters`
--      — so a guest who won a Chork week was discarded and the
--      runner-up got reported as the week's winner.
--   2. Both `match_standings` and `chork_standings` return a row for
--      EVERY seat in a Match, including one that never opened a
--      route in that set. `league_standings`'s `placings` CTE only
--      excluded a null `user_id` (guests), so an empty seat was
--      still dense-ranked and banked league points for turning up
--      to nothing — a 2-player week where only one climbs left the
--      other in 2nd place on 0 points, worth 8.
--
-- Fix: one new internal helper, `league_week_placings(set_id)`, is
-- now the single home for "what did this week's board look like" —
-- the game-mode branch, Chork's ordering, AND the "did this seat
-- actually log anything" filter all live there once. Both
-- `league_standings` and `get_league` read it instead of each
-- hand-rolling their own copy, so the two can't drift again.
--
-- "Did this seat log anything" is an existence check against
-- `route_logs` — attempts/sends can't be used, they're masked to 0
-- for everyone but the log's owner (see CONTEXT.md "Attempt
-- privacy"). A seat that attempted a route and sent nothing still
-- placed; a seat with no row for this set never turned up.
--
-- 133 is already applied to the linked project — this repo is
-- forward-only, so this migration is `create or replace` on the
-- affected functions, not an edit to 133.

-- ── The two rules, now explicitly safe for every role ────────────
-- Same bodies as 133 — `parallel safe` and an explicit grant, the
-- `compute_points` precedent (063).

create or replace function public.league_placement_points(p_rank integer)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (case
    when p_rank is null or p_rank < 1 then 0
    when p_rank = 1 then 10
    when p_rank = 2 then 8
    when p_rank = 3 then 6
    when p_rank = 4 then 5
    when p_rank = 5 then 4
    when p_rank = 6 then 3
    when p_rank = 7 then 2
    else 1
  end)::smallint
$$;
-- Pure helper — safe for every role.
grant execute on function public.league_placement_points(integer) to public;

create or replace function public.league_drops(p_weeks integer)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_weeks >= 8 then 2
    when p_weeks >= 4 then 1
    else 0
  end
$$;
-- Pure helper — safe for every role.
grant execute on function public.league_drops(integer) to public;

-- ── The one home for a week's board ──────────────────────────────
--
-- Internal, like `league_visible_to` / `league_assert_host` — never
-- called directly from a client, only from `league_standings` and
-- `get_league`. Returns the week's FULL board: every seat that
-- placed, points weeks ranked by `match_standings`, Chork weeks
-- ranked by `dense_rank() over (is_out, letters)`. Guests (a null
-- `user_id`) stay IN the result so they still push account-holders
-- down the ranking — callers filter guests out where they only want
-- account rows (`league_standings`'s table has no seat for a guest;
-- `get_league`'s `winner_user_id` does not, on purpose).
create or replace function public.league_week_placings(p_set_id uuid)
returns table (player_id uuid, user_id uuid, rank smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select game_mode from public.sets where id = p_set_id
  ),
  -- A seat placed if it has at least one route_logs row for this
  -- set. Mirrors match_standings' seat/route_logs join exactly
  -- (121, ~160-200): guest seats keyed by player_id, account seats
  -- by user_id.
  placed as (
    select sp.id as seat_id
    from public.set_players sp
    where sp.set_id = p_set_id
      and exists (
        select 1 from public.route_logs rl
        where rl.set_id = p_set_id
          and (
            (sp.user_id is not null and rl.user_id = sp.user_id)
            or
            (sp.user_id is null and rl.player_id = sp.id)
          )
      )
  ),
  points_board as (
    select ms.player_id, ms.user_id, ms.rank
    from public.match_standings(p_set_id) ms
    join placed pl on pl.seat_id = ms.player_id
    where (select cfg.game_mode from cfg) <> 'chork'
  ),
  chork_board as (
    -- Fewest letters wins; anyone out is behind everyone still
    -- standing. Re-ranked over the PLACED rows only, so a seat that
    -- never opened a route can't occupy a place in the ordering —
    -- not even last.
    select cs.player_id, cs.user_id,
           (dense_rank() over (order by cs.is_out, cs.letters))::smallint as rank
    from public.chork_standings(p_set_id) cs
    join placed pl on pl.seat_id = cs.player_id
    where (select cfg.game_mode from cfg) = 'chork'
  )
  select * from points_board
  union all
  select * from chork_board
$$;
revoke execute on function public.league_week_placings(uuid) from anon, public, authenticated;

-- ── The two callers, now reading the one board ───────────────────

-- The table. One row per account-holder who played a week. Guests
-- take their placing in the week (they push account-holders down)
-- and get no row. Drops are counted against the LEAGUE's week
-- count: a climber who missed weeks has zeros, and those are the
-- weeks that get dropped first, which is the whole point of the rule.
create or replace function public.league_standings(p_league_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  played smallint,
  points smallint,
  dropped_points smallint,
  firsts smallint,
  seconds smallint,
  thirds smallint,
  rank smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.league_visible_to(p_league_id, caller_id) then
    raise exception 'League not found.';
  end if;

  return query
  with weeks as (
    select s.id as set_id
    from public.sets s
    where s.league_id = p_league_id and s.status = 'archived'
  ),
  n as (select count(*)::integer as weeks from weeks),
  placings as (
    select w.set_id, lwp.user_id, lwp.rank
    from weeks w
    cross join lateral public.league_week_placings(w.set_id) lwp
    where lwp.user_id is not null
  ),
  scored as (
    select p.user_id, p.rank,
           public.league_placement_points(p.rank) as pts,
           row_number() over (
             partition by p.user_id
             order by public.league_placement_points(p.rank) desc, p.rank asc
           ) as best_first
    from placings p
  ),
  totals as (
    select
      s.user_id,
      count(*)::smallint as played,
      coalesce(sum(s.pts) filter (
        where s.best_first <= (select weeks from n) - public.league_drops((select weeks from n))
      ), 0)::smallint as points,
      coalesce(sum(s.pts) filter (
        where s.best_first > (select weeks from n) - public.league_drops((select weeks from n))
      ), 0)::smallint as dropped_points,
      (count(*) filter (where s.rank = 1))::smallint as firsts,
      (count(*) filter (where s.rank = 2))::smallint as seconds,
      (count(*) filter (where s.rank = 3))::smallint as thirds
    from scored s
    group by s.user_id
  )
  select
    t.user_id,
    pr.username,
    pr.name as display_name,
    pr.avatar_url,
    t.played,
    t.points,
    t.dropped_points,
    t.firsts,
    t.seconds,
    t.thirds,
    (dense_rank() over (
      order by t.points desc, t.firsts desc, t.seconds desc, t.thirds desc
    ))::smallint as rank
  from totals t
  join public.profiles pr on pr.id = t.user_id
  -- By position, not name: `rank` is also an OUT parameter of this
  -- plpgsql function and an unqualified reference would be ambiguous.
  order by 11, pr.username;
end;
$$;

-- The League and its weeks, newest first. `to_jsonb(l)` so a column
-- added later rides along, the way `get_match_state_for_user` does.
create or replace function public.get_league(p_league_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  l public.leagues;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.league_visible_to(p_league_id, caller_id) then
    return null;
  end if;
  select * into l from public.leagues where id = p_league_id;

  return jsonb_build_object(
    'league', to_jsonb(l),
    'is_host', (l.host_id = caller_id),
    -- Every set carrying this league_id, INCLUDING a live one still
    -- in progress — a running week belongs on the list. week_count
    -- and league_standings itself only count `status = 'archived'`
    -- weeks; an unfinished week has no board yet.
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'set_id', s.id,
        'name', s.name,
        'status', s.status,
        'game_mode', s.game_mode,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'player_count', (select count(*) from public.set_players sp where sp.set_id = s.id),
        'winner_user_id', (
          case when s.status = 'archived' then
            (select lwp.user_id from public.league_week_placings(s.id) lwp
              where lwp.rank = 1 and lwp.user_id is not null limit 1)
          else null end
        )
      ) order by s.starts_at desc)
      from public.sets s
      where s.league_id = p_league_id
    ), '[]'::jsonb)
  );
end;
$$;
