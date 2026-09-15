-- ────────────────────────────────────────────────────────────────
-- Empty lobbies: reuse one, sweep one sooner, keep it out of history
-- ────────────────────────────────────────────────────────────────
--
-- Found testing at Yonder: ending a game "did nothing". It had ended.
-- But a host who tapped a poster a few times had several empty lobbies
-- live at once, the Games page's banner shows only the most recently
-- joined live game, and ending one uncovered the next identical
-- "Tom's game". Three changes, one per way an empty lobby got in the
-- way:
--
-- 1. `create_match` reuses the caller's own empty live lobby (same
--    league, or none) instead of inserting another. The poster's setup
--    is applied, the lobby keeps its name, location and players, the
--    game mode goes back to the create default (the Chork poster sets
--    it again straight after), and the idle clock restarts.
-- 2. `end_stale_matches` ends a lobby that still has no routes after
--    3 hours idle. A game with routes keeps its 24 hours.
-- 3. `get_match_history` leaves out a game that ended with no routes.
--    Nothing was played, so there is nothing to look back on.
--
-- Signatures and return types are unchanged, so `create or replace`
-- keeps every existing grant.

-- ── 1. create_match ───────────────────────────────────────────────

create or replace function public.create_match(
  p_name text default null,
  p_location text default null,
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null,
  p_discipline text default 'boulder',
  p_handicap boolean default false,
  p_alt_grading_scale text default null,
  p_alt_min_grade smallint default null,
  p_alt_max_grade smallint default null,
  p_league_id uuid default null
)
returns table(id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_set_id uuid;
  new_code text;
  new_scale_id uuid;
  grade_label text;
  grade_ordinal smallint;
  v_discipline text := coalesce(p_discipline, 'boulder');
  v_formula boolean := p_grading_scale in ('v', 'font', 'yds', 'french');
  v_league public.leagues;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform public.match_setup_check(
    v_discipline, p_grading_scale, p_min_grade, p_max_grade,
    p_custom_grades, p_handicap,
    p_alt_grading_scale, p_alt_min_grade, p_alt_max_grade
  );

  -- A week can only be started by the League's host, into a League
  -- that is still running.
  if p_league_id is not null then
    select * into v_league from public.leagues where public.leagues.id = p_league_id;
    if v_league.id is null or v_league.host_id <> caller_id then
      raise exception 'Only the host can start a week of this league.';
    end if;
    if v_league.ended_at is not null then
      raise exception 'This league has ended.';
    end if;
  end if;

  -- An empty lobby you already host is the game you meant. Locked, so
  -- two quick taps settle on one row rather than racing to update it.
  select s.id, s.code into new_set_id, new_code
    from public.sets s
   where s.owner_kind = 'climber'
     and s.status = 'live'
     and s.host_id = caller_id
     and s.league_id is not distinct from p_league_id
     and not exists (select 1 from public.routes r where r.set_id = s.id)
   order by s.starts_at desc
   limit 1
   for update of s;

  if new_set_id is not null then
    update public.sets
       set name = coalesce(public.sets.name, nullif(trim(coalesce(p_name, '')), '')),
           location = coalesce(public.sets.location, nullif(trim(coalesce(p_location, '')), '')),
           grading_scale = p_grading_scale,
           min_grade = case when v_formula then p_min_grade else null end,
           max_grade = case when v_formula then p_max_grade else null end,
           discipline = v_discipline,
           handicap = coalesce(p_handicap, false),
           alt_grading_scale = p_alt_grading_scale,
           alt_min_grade = case when p_alt_grading_scale is not null then p_alt_min_grade else null end,
           alt_max_grade = case when p_alt_grading_scale is not null then p_alt_max_grade else null end,
           game_mode = 'points',
           last_activity_at = now(),
           updated_at = now()
     where public.sets.id = new_set_id;

    delete from public.set_grades where set_id = new_set_id;
  else
    new_code := public.generate_set_code();

    insert into public.sets (
      owner_kind, host_id, gym_id, code, name, location,
      grading_scale, min_grade, max_grade, discipline, handicap,
      alt_grading_scale, alt_min_grade, alt_max_grade,
      status, starts_at, ends_at, last_activity_at, league_id
    ) values (
      'climber',
      caller_id,
      null,
      new_code,
      nullif(trim(coalesce(p_name, '')), ''),
      nullif(trim(coalesce(p_location, '')), ''),
      p_grading_scale,
      case when v_formula then p_min_grade else null end,
      case when v_formula then p_max_grade else null end,
      v_discipline,
      coalesce(p_handicap, false),
      p_alt_grading_scale,
      case when p_alt_grading_scale is not null then p_alt_min_grade else null end,
      case when p_alt_grading_scale is not null then p_alt_max_grade else null end,
      'live',
      now(),
      null,
      now(),
      p_league_id
    )
    returning public.sets.id into new_set_id;

    insert into public.set_players (set_id, user_id, is_host)
    values (new_set_id, caller_id, true);
  end if;

  if p_grading_scale = 'custom' then
    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.set_grades (set_id, ordinal, label)
      values (new_set_id, grade_ordinal, trim(grade_label));
      grade_ordinal := grade_ordinal + 1;
    end loop;
  end if;

  if p_save_scale_name is not null
     and char_length(trim(p_save_scale_name)) > 0
     and p_grading_scale = 'custom' then
    insert into public.user_custom_scales (user_id, name)
    values (caller_id, trim(p_save_scale_name))
    returning public.user_custom_scales.id into new_scale_id;

    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.user_custom_scale_grades (scale_id, ordinal, label)
      values (new_scale_id, grade_ordinal, trim(grade_label));
      grade_ordinal := grade_ordinal + 1;
    end loop;
  end if;

  return query select new_set_id, new_code;
end;
$$;

-- ── 2. end_stale_matches ──────────────────────────────────────────

create or replace function public.end_stale_matches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_count integer;
begin
  with stale as (
    update public.sets s
       set status = 'archived',
           ends_at = now()
     where s.owner_kind = 'climber'
       and s.status = 'live'
       and (
         coalesce(s.last_activity_at, s.starts_at) < now() - interval '24 hours'
         -- A lobby nobody put a route up in: a warm-up and a wait for
         -- friends fit in 3 hours, yesterday's lobby does not.
         or (
           coalesce(s.last_activity_at, s.starts_at) < now() - interval '3 hours'
           and not exists (select 1 from public.routes r where r.set_id = s.id)
         )
       )
    returning s.id
  )
  select count(*) into ended_count from stale;

  return ended_count;
end;
$$;

-- ── 3. get_match_history ──────────────────────────────────────────

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
  handicap boolean,
  user_rank smallint,
  user_sends smallint,
  user_flashes smallint,
  user_points smallint,
  user_points_tenths integer,
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
    select s.id, s.name, s.location, s.starts_at, s.ends_at, s.handicap
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id and sp.user_id = p_user_id and sp.left_at is null
    where s.owner_kind = 'climber'
      and s.status = 'archived'
      and s.ends_at is not null
      and (p_before is null or s.ends_at < p_before)
      -- An ended lobby that never had a route isn't a game.
      and exists (select 1 from public.routes r where r.set_id = s.id)
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
      sd.set_id, sd.user_id, sd.player_id,
      coalesce(p.name, sp.display_name) as display_name,
      p.username
    from standings sd
    join public.set_players sp on sp.id = sd.player_id
    left join public.profiles p on p.id = sd.user_id
    where sd.rank = 1
    order by sd.set_id, sd.player_id
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
    m.handicap,
    mine_st.rank,
    mine_st.sends,
    mine_st.flashes,
    mine_st.points,
    mine_st.points_tenths,
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
