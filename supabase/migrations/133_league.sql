-- ────────────────────────────────────────────────────────────────
-- League: a series of Matches with a cumulative table
-- ────────────────────────────────────────────────────────────────
--
-- A Match is an event; a League is a fixture — the thing that makes
-- "our Tuesday league" a reason to come back next week. This is the
-- friend-group slice: a host strings finished Matches they hosted
-- into a series and everyone who climbed in one is on the table.
-- Design: docs/superpowers/specs/2026-08-30-league-design.md.
--
-- Nothing is stored for the table. `league_standings` reads the
-- weeks' own boards (`match_standings` / `chork_standings`) on every
-- call, pays a fixed ladder by placing, drops the lowest N by a fixed
-- rule, and ranks — so a re-ended or newly added Match is right on
-- the next read and there is no second scorer to keep honest.
--
-- Like `friends` (104): NO Data API grant and no policies. Every
-- read and write is a SECURITY DEFINER RPC, so "only the host" lives
-- in one place and the table is unreachable from supabase-js.
--
-- Cases pinned in league.test.ts (TS mirrors of the two helpers):
--   placement: 1→10 2→8 3→6 4→5 5→4 6→3 7→2 8+→1, 0 or less → 0
--   drops:     weeks<4 → 0, 4..7 → 1, 8+ → 2

-- ── 1. Table + column ────────────────────────────────────────────

create table public.leagues (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);
comment on table public.leagues is
  'A series of Matches with a cumulative table. Read and written only '
  'through SECURITY DEFINER RPCs — deliberately NO Data API grant.';

create index leagues_host_id_idx on public.leagues (host_id);

alter table public.leagues enable row level security;
revoke all on public.leagues from anon, authenticated;

alter table public.sets
  add column league_id uuid references public.leagues(id) on delete set null;
comment on column public.sets.league_id is
  'The League this Match is a week of. Matches only; a gym Set never carries one (yet).';
create index sets_league_id_idx on public.sets (league_id) where league_id is not null;

-- ── 2. The two rules, each spelled once ──────────────────────────

create or replace function public.league_placement_points(p_rank integer)
returns smallint
language sql
immutable
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

create or replace function public.league_drops(p_weeks integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_weeks >= 8 then 2
    when p_weeks >= 4 then 1
    else 0
  end
$$;

-- ── 3. Who may read a League ─────────────────────────────────────
-- The host, or anyone with an account who has a seat in one of its
-- weeks. "Not found" and "not yours" collapse so an id can't be probed.

create or replace function public.league_visible_to(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l where l.id = p_league_id and l.host_id = p_user_id
  ) or exists (
    select 1
    from public.sets s
    join public.set_players sp on sp.set_id = s.id
    where s.league_id = p_league_id and sp.user_id = p_user_id
  )
$$;
revoke execute on function public.league_visible_to(uuid, uuid) from anon, public, authenticated;

-- ── 4. Writes — host only ────────────────────────────────────────

-- A finished Match the caller hosted, in no League yet. Shared by
-- create + add so the two can't drift.
create or replace function public.league_assert_addable(p_set_id uuid, p_host_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sets;
begin
  select * into s from public.sets where id = p_set_id and owner_kind = 'climber';
  if s.id is null then
    raise exception 'Match not found.';
  end if;
  if s.host_id <> p_host_id then
    raise exception 'Only the host of a match can add it to a league.';
  end if;
  if s.status <> 'archived' then
    raise exception 'End the match first — only finished matches count as a week.';
  end if;
  if s.league_id is not null then
    raise exception 'That match is already a week of a league.';
  end if;
end;
$$;
revoke execute on function public.league_assert_addable(uuid, uuid) from anon, public, authenticated;

create or replace function public.create_league(p_name text, p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  new_id uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Give the league a name (up to 80 characters).';
  end if;
  perform public.league_assert_addable(p_set_id, caller_id);

  insert into public.leagues (host_id, name) values (caller_id, v_name)
  returning id into new_id;
  update public.sets set league_id = new_id where id = p_set_id;
  return new_id;
end;
$$;
revoke execute on function public.create_league(text, uuid) from anon, public;
grant execute on function public.create_league(text, uuid) to authenticated;

-- The host's League, still running. Every other write goes through this.
create or replace function public.league_assert_host(p_league_id uuid, p_host_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leagues;
begin
  select * into l from public.leagues where id = p_league_id;
  if l.id is null or l.host_id <> p_host_id then
    raise exception 'Only the host can do that.';
  end if;
  return l;
end;
$$;
revoke execute on function public.league_assert_host(uuid, uuid) from anon, public, authenticated;

create or replace function public.rename_league(p_league_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Give the league a name (up to 80 characters).';
  end if;
  perform public.league_assert_host(p_league_id, caller_id);
  update public.leagues set name = v_name where id = p_league_id;
  return p_league_id;
end;
$$;
revoke execute on function public.rename_league(uuid, text) from anon, public;
grant execute on function public.rename_league(uuid, text) to authenticated;

create or replace function public.add_match_to_league(p_league_id uuid, p_set_id uuid)
returns uuid
language plpgsql
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
  l := public.league_assert_host(p_league_id, caller_id);
  if l.ended_at is not null then
    raise exception 'This league has ended.';
  end if;
  perform public.league_assert_addable(p_set_id, caller_id);
  update public.sets set league_id = p_league_id where id = p_set_id;
  return p_league_id;
end;
$$;
revoke execute on function public.add_match_to_league(uuid, uuid) from anon, public;
grant execute on function public.add_match_to_league(uuid, uuid) to authenticated;

create or replace function public.remove_match_from_league(p_league_id uuid, p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  perform public.league_assert_host(p_league_id, caller_id);
  update public.sets set league_id = null
   where id = p_set_id and league_id = p_league_id;
  if not found then
    raise exception 'That match is not a week of this league.';
  end if;
  return p_league_id;
end;
$$;
revoke execute on function public.remove_match_from_league(uuid, uuid) from anon, public;
grant execute on function public.remove_match_from_league(uuid, uuid) to authenticated;

create or replace function public.end_league(p_league_id uuid)
returns uuid
language plpgsql
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
  l := public.league_assert_host(p_league_id, caller_id);
  if l.ended_at is not null then
    raise exception 'This league has ended.';
  end if;
  update public.leagues set ended_at = now() where id = p_league_id;
  return p_league_id;
end;
$$;
revoke execute on function public.end_league(uuid) from anon, public;
grant execute on function public.end_league(uuid) to authenticated;

-- ── 5. Reads ─────────────────────────────────────────────────────

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
    select s.id as set_id, s.game_mode
    from public.sets s
    where s.league_id = p_league_id and s.status = 'archived'
  ),
  n as (select count(*)::integer as weeks from weeks),
  placings as (
    select w.set_id, st.user_id, st.rank
    from weeks w
    cross join lateral (
      select ms.user_id, ms.rank
      from public.match_standings(w.set_id) ms
      where w.game_mode <> 'chork'
      union all
      -- Chork: fewest letters wins; anyone out is behind everyone
      -- still standing. dense_rank so a tie shares, as the board does.
      select cs.user_id,
             (dense_rank() over (order by cs.is_out, cs.letters))::smallint
      from public.chork_standings(w.set_id) cs
      where w.game_mode = 'chork'
    ) st
    where st.user_id is not null
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
revoke execute on function public.league_standings(uuid) from anon, public;
grant execute on function public.league_standings(uuid) to authenticated;

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
          case when s.status = 'archived' and s.game_mode <> 'chork' then
            (select ms.user_id from public.match_standings(s.id) ms
              where ms.rank = 1 and ms.user_id is not null limit 1)
          when s.status = 'archived' then
            (select cs.user_id from public.chork_standings(s.id) cs
              where cs.user_id is not null order by cs.is_out, cs.letters limit 1)
          else null end
        )
      ) order by s.starts_at desc)
      from public.sets s
      where s.league_id = p_league_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.get_league(uuid) from anon, public;
grant execute on function public.get_league(uuid) to authenticated;

-- The caller's Leagues — hosted or played — newest activity first.
create or replace function public.get_my_leagues()
returns table (
  id uuid,
  name text,
  host_id uuid,
  is_host boolean,
  ended_at timestamptz,
  week_count integer,
  last_week_at timestamptz,
  my_rank smallint
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
  return query
  select
    l.id,
    l.name,
    l.host_id,
    (l.host_id = caller_id) as is_host,
    l.ended_at,
    (select count(*)::integer from public.sets s
      where s.league_id = l.id and s.status = 'archived') as week_count,
    (select max(s.ends_at) from public.sets s
      where s.league_id = l.id and s.status = 'archived') as last_week_at,
    (select st.rank from public.league_standings(l.id) st
      where st.user_id = caller_id) as my_rank
  from public.leagues l
  where public.league_visible_to(l.id, caller_id)
  order by coalesce(
    (select max(s.ends_at) from public.sets s where s.league_id = l.id),
    l.created_at
  ) desc;
end;
$$;
revoke execute on function public.get_my_leagues() from anon, public;
grant execute on function public.get_my_leagues() to authenticated;

-- ── 6. create_match learns its League ────────────────────────────
-- A new parameter means a new signature: drop the 12-arg one (117)
-- and re-create with `p_league_id` last. Body is 117's with one
-- guard and one column added.

drop function if exists public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean,
  text, smallint, smallint
);

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
  v_alt_family text;
  v_league public.leagues;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_discipline not in ('boulder', 'sport', 'top-rope') then
    raise exception 'Invalid discipline' using errcode = '22023';
  end if;

  if p_grading_scale is null
     or p_grading_scale not in ('v', 'font', 'custom', 'points', 'yds', 'french') then
    raise exception 'Invalid grading scale' using errcode = '22023';
  end if;

  -- A handicap scores relative to a grade, so it needs one. `points`
  -- has no grades at all and a `custom` ladder's ordinals aren't a
  -- difficulty scale — refuse rather than silently score everything
  -- at full value, which would look like the handicap doing nothing.
  if coalesce(p_handicap, false)
     and p_grading_scale not in ('v', 'font', 'yds', 'french') then
    raise exception 'Handicap needs a graded scale' using errcode = '22023';
  end if;

  if p_grading_scale = 'custom' then
    if p_custom_grades is null or array_length(p_custom_grades, 1) is null then
      raise exception 'Custom grading scale requires at least one grade' using errcode = '22023';
    end if;
    if array_length(p_custom_grades, 1) > 50 then
      raise exception 'Custom grading scale capped at 50 grades' using errcode = '22023';
    end if;
  end if;

  -- The second scale has to belong to the OTHER family, or it is not
  -- a second scale — it is the same one twice, and every route would
  -- resolve to whichever slot was read first.
  if p_alt_grading_scale is not null then
    if p_alt_grading_scale not in ('v', 'font', 'yds', 'french') then
      raise exception 'Invalid second grading scale' using errcode = '22023';
    end if;
    if p_alt_grading_scale in ('v', 'font') then
      v_alt_family := 'boulder';
    else
      v_alt_family := 'rope';
    end if;
    if public.discipline_family(v_discipline) = v_alt_family then
      raise exception 'The second scale must be for the other discipline'
        using errcode = '22023';
    end if;
    if p_alt_min_grade is null or p_alt_max_grade is null
       or p_alt_max_grade < p_alt_min_grade then
      raise exception 'Second scale needs a grade range' using errcode = '22023';
    end if;
  end if;

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
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_min_grade else null end,
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_max_grade else null end,
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

revoke execute on function public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean,
  text, smallint, smallint, uuid
) from anon, public;
grant execute on function public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean,
  text, smallint, smallint, uuid
) to authenticated;
