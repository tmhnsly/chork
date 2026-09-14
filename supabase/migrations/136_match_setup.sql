-- 136_match_setup.sql
--
-- Lobby-first matches. A match is created with defaults in one tap
-- and its setup (name, where, discipline, grading, mixed-day second
-- scale) is changed from the lobby — until the first route goes up,
-- after which grading is locked because routes have been graded on
-- it. The validation create_match already did is lifted into
-- match_setup_check so both writers share one copy.

-- ── The check ────────────────────────────────────
create or replace function public.match_setup_check(
  p_discipline text,
  p_grading_scale text,
  p_min_grade smallint,
  p_max_grade smallint,
  p_custom_grades text[],
  p_handicap boolean,
  p_alt_grading_scale text,
  p_alt_min_grade smallint,
  p_alt_max_grade smallint
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_alt_family text;
begin
  if p_discipline not in ('boulder', 'sport', 'top-rope') then
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
    if public.discipline_family(p_discipline) = v_alt_family then
      raise exception 'The second scale must be for the other discipline'
        using errcode = '22023';
    end if;
    if p_alt_min_grade is null or p_alt_max_grade is null
       or p_alt_max_grade < p_alt_min_grade then
      raise exception 'Second scale needs a grade range' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke execute on function public.match_setup_check(
  text, text, smallint, smallint, text[], boolean, text, smallint, smallint
) from anon, public;
grant execute on function public.match_setup_check(
  text, text, smallint, smallint, text[], boolean, text, smallint, smallint
) to authenticated;

-- ── create_match, calling the check ──────────────
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

-- ── set_match_setup ──────────────────────────────
-- Host only, live only, and only while the match has no routes:
-- a route is graded on the scale it was added under, and changing
-- the scale beneath it would relabel every send.
create or replace function public.set_match_setup(
  p_set_id uuid,
  p_name text default null,
  p_location text default null,
  p_discipline text default 'boulder',
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null,
  p_alt_grading_scale text default null,
  p_alt_min_grade smallint default null,
  p_alt_max_grade smallint default null
)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  current public.sets;
  result public.sets;
  new_scale_id uuid;
  grade_label text;
  grade_ordinal smallint;
  v_discipline text := coalesce(p_discipline, 'boulder');
  v_formula boolean;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into current
    from public.sets
   where id = p_set_id
     and owner_kind = 'climber'
     and status = 'live'
     and host_id = caller_id;
  if current.id is null then
    raise exception 'Only the host can change a live match'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.routes where set_id = p_set_id) then
    raise exception 'Routes are already up — grading is locked'
      using errcode = '22023';
  end if;

  v_formula := p_grading_scale in ('v', 'font', 'yds', 'french');

  -- The handicap survives a move between graded scales and switches
  -- itself off on a scale without grades — the same rule the create
  -- form's reducer applies, so the two never disagree.
  perform public.match_setup_check(
    v_discipline, p_grading_scale, p_min_grade, p_max_grade,
    p_custom_grades, (current.handicap and v_formula),
    p_alt_grading_scale, p_alt_min_grade, p_alt_max_grade
  );

  update public.sets
     set name = nullif(trim(coalesce(p_name, '')), ''),
         location = nullif(trim(coalesce(p_location, '')), ''),
         discipline = v_discipline,
         grading_scale = p_grading_scale,
         min_grade = case when v_formula then p_min_grade else null end,
         max_grade = case when v_formula then p_max_grade else null end,
         handicap = (current.handicap and v_formula),
         alt_grading_scale = p_alt_grading_scale,
         alt_min_grade = case when p_alt_grading_scale is not null then p_alt_min_grade else null end,
         alt_max_grade = case when p_alt_grading_scale is not null then p_alt_max_grade else null end,
         updated_at = now()
   where id = p_set_id
  returning * into result;

  delete from public.set_grades where set_id = p_set_id;
  if p_grading_scale = 'custom' then
    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.set_grades (set_id, ordinal, label)
      values (p_set_id, grade_ordinal, trim(grade_label));
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

  return result;
end;
$$;

revoke execute on function public.set_match_setup(
  uuid, text, text, text, text, smallint, smallint, text[], text, text, smallint, smallint
) from anon, public;
grant execute on function public.set_match_setup(
  uuid, text, text, text, text, smallint, smallint, text[], text, text, smallint, smallint
) to authenticated;
