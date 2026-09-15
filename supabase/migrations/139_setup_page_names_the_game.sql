-- ────────────────────────────────────────────────────────────────
-- A game set up on purpose keeps what was typed
-- ────────────────────────────────────────────────────────────────
--
-- Games get a setup page before they exist (2026-09-15): pick a game,
-- name it, say where, choose what you're climbing, then start. 137 had
-- `create_match` reuse the caller's empty live game and keep its old
-- name and location, because a one-tap poster only ever sent a default
-- name. A setup page is deliberate, so the name and location typed
-- there replace the old ones. The rest of 137's reuse stays: same
-- league or none, row-locked, players kept, game mode reset, idle
-- clock restarted.
--
-- Same signature and return type, so grants carry over.

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
       set name = nullif(trim(coalesce(p_name, '')), ''),
           location = nullif(trim(coalesce(p_location, '')), ''),
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
