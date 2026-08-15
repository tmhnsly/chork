-- ────────────────────────────────────────────────────────────────
-- Match RPCs learn about discipline
-- ────────────────────────────────────────────────────────────────
--
-- Migration 091 added the columns; this teaches the two write paths
-- to set them, and widens the scale validation to admit the rope
-- scales it added.
--
-- Both functions are `create or replace` with the SAME signature plus
-- one trailing defaulted argument, so existing callers keep working
-- unchanged — a Match created without naming a discipline is a
-- boulder Match, which is what every Match was until now.

-- ── create_match ──────────────────────────────────────────────────

create or replace function public.create_match(
  p_name text default null,
  p_location text default null,
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null,
  p_discipline text default 'boulder'
)
returns table (id uuid, code text)
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
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_discipline not in ('boulder', 'sport', 'top-rope') then
    raise exception 'Invalid discipline' using errcode = '22023';
  end if;

  -- Rope scales admitted here for the first time. Deliberately NOT
  -- checked against the discipline: a Set's discipline is only a
  -- default and its routes may each differ, so a mixed outdoor Match
  -- on a custom ladder is a legitimate shape. The app offers the
  -- sensible scales per discipline at the point of choosing.
  if p_grading_scale is null
     or p_grading_scale not in ('v', 'font', 'custom', 'points', 'yds', 'french') then
    raise exception 'Invalid grading scale' using errcode = '22023';
  end if;

  if p_grading_scale = 'custom' then
    if p_custom_grades is null or array_length(p_custom_grades, 1) is null then
      raise exception 'Custom grading scale requires at least one grade' using errcode = '22023';
    end if;
    if array_length(p_custom_grades, 1) > 50 then
      raise exception 'Custom grading scale capped at 50 grades' using errcode = '22023';
    end if;
  end if;

  new_code := public.generate_set_code();

  insert into public.sets (
    owner_kind, host_id, gym_id, code, name, location,
    grading_scale, min_grade, max_grade, discipline,
    status, starts_at, ends_at, last_activity_at
  ) values (
    'climber',
    caller_id,
    null,
    new_code,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_location, '')), ''),
    p_grading_scale,
    -- A numeric range only means something on a formula scale. `points`
    -- has no grades and `custom` carries its own ladder.
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_min_grade else null end,
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_max_grade else null end,
    v_discipline,
    'live',
    now(),
    null,
    now()
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

-- The 7-argument overload from 084 is now shadowed by this one for
-- every caller that names its arguments (which supabase-js always
-- does), but an unnamed 7-arg call would still resolve to it. Drop it
-- so there is exactly one create_match.
drop function if exists public.create_match(text, text, text, smallint, smallint, text[], text);

grant execute on function public.create_match(text, text, text, smallint, smallint, text[], text, text) to authenticated;
revoke execute on function public.create_match(text, text, text, smallint, smallint, text[], text, text) from anon, public;

-- ── add_match_route ───────────────────────────────────────────────

create or replace function public.add_match_route(
  p_set_id uuid,
  p_description text default null,
  p_grade smallint default null,
  p_has_zone boolean default false,
  p_discipline text default null
)
returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_number integer;
  result public.routes;
  set_scale text;
  set_status text;
  set_kind text;
  set_discipline text;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_discipline is not null
     and p_discipline not in ('boulder', 'sport', 'top-rope') then
    raise exception 'Invalid discipline' using errcode = '22023';
  end if;

  if not public.is_set_player(p_set_id) then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  select grading_scale, status, owner_kind, discipline
    into set_scale, set_status, set_kind, set_discipline
  from public.sets
  where id = p_set_id
  for update;

  if set_scale is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_kind <> 'climber' then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_status <> 'live' then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into next_number
  from public.routes
  where set_id = p_set_id;

  insert into public.routes (
    set_id, number, description, declared_grade, has_zone, added_by, discipline
  ) values (
    p_set_id,
    next_number,
    nullif(trim(coalesce(p_description, '')), ''),
    case when set_scale = 'points' then null else p_grade end,
    coalesce(p_has_zone, false),
    caller_id,
    -- Store only a genuine disagreement. Passing the Set's own
    -- discipline is normalised back to null so that changing the
    -- Set's default later still moves this route with it.
    case when p_discipline is null or p_discipline = set_discipline
         then null else p_discipline end
  )
  returning * into result;

  return result;
end;
$$;

drop function if exists public.add_match_route(uuid, text, smallint, boolean);

grant execute on function public.add_match_route(uuid, text, smallint, boolean, text) to authenticated;
revoke execute on function public.add_match_route(uuid, text, smallint, boolean, text) from anon, public;
