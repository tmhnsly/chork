-- ────────────────────────────────────────────────────────────────
-- Boulders and ropes on the same day
-- ────────────────────────────────────────────────────────────────
--
-- Reported from a real session: start a Match on boulders and you
-- cannot climb anything else on it.
--
-- A route could always override its discipline — but a Match carried
-- exactly ONE grading scale, so the moment you switched a route to
-- Top rope the grade picker vanished and the route was forced
-- ungraded. `V4` is not a rope grade, so refusing was right; having
-- nothing to offer instead was the bug. On a mixed day that left half
-- the session with no grades at all, which also silently disables the
-- handicap and Chork's above-your-limit allowance for those routes,
-- since both need a grade to compare.
--
-- ── Two families, not three disciplines ─────────────────────────
--
-- Sport and top-rope grade identically (French / YDS); bouldering
-- does not (V / Font). So the ceiling is TWO scales, never three, and
-- that is what this stores: the Match keeps its own scale, and gains
-- one for the family its own discipline is NOT.
--
-- Named `alt_` rather than `rope_` deliberately. A Match started on
-- Sport that adds boulders needs exactly the same second slot, and
-- calling it `rope_` would leave that Match's own grades in the
-- "rope" column and its boulder grades in the generic one. `alt_` is
-- true whichever way round the session goes.

alter table public.sets
  add column if not exists alt_grading_scale text,
  add column if not exists alt_min_grade smallint,
  add column if not exists alt_max_grade smallint;

comment on column public.sets.alt_grading_scale is
  'The scale for the discipline family this Match''s own discipline is '
  'NOT — rope grades on a bouldering Match, or boulder grades on a '
  'roped one. Null means a single-discipline session. Climber-owned '
  'Matches only; a gym Set is one discipline by definition.';

alter table public.sets drop constraint if exists sets_alt_scale_ck;
alter table public.sets add constraint sets_alt_scale_ck
  check (
    alt_grading_scale is null
    or (alt_grading_scale in ('v', 'font', 'yds', 'french')
        and owner_kind = 'climber')
  );

-- A second scale needs a second range, and only a formula scale has
-- one. Custom and points are deliberately not offered as the alt:
-- a custom ladder is one ladder, and points has no grades to mix.
alter table public.sets drop constraint if exists sets_alt_range_ck;
alter table public.sets add constraint sets_alt_range_ck
  check (
    alt_grading_scale is null
    or (alt_min_grade is not null
        and alt_max_grade is not null
        and alt_max_grade >= alt_min_grade)
  );

-- ── Which family a discipline grades on ───────────────────────────
--
-- Mirrors `disciplineFamily` in `src/lib/data/grade-label.ts`, the
-- same way `compute_points` mirrors `computePoints`.

create or replace function public.discipline_family(p_discipline text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_discipline = 'boulder' then 'boulder' else 'rope' end;
$$;

revoke execute on function public.discipline_family(text) from anon, public;
grant execute on function public.discipline_family(text) to authenticated, service_role;

-- ── Creating a mixed Match ────────────────────────────────────────
--
-- The 9-argument signature is dropped rather than left beside the
-- new one: defaulted parameters create an OVERLOAD, and two
-- resolvable signatures is how migration 101 ended up with a
-- function that could not clear a value.

drop function if exists public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean
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
  p_alt_max_grade smallint default null
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

  new_code := public.generate_set_code();

  insert into public.sets (
    owner_kind, host_id, gym_id, code, name, location,
    grading_scale, min_grade, max_grade, discipline, handicap,
    alt_grading_scale, alt_min_grade, alt_max_grade,
    status, starts_at, ends_at, last_activity_at
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

revoke execute on function public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean,
  text, smallint, smallint
) from anon, public;
grant execute on function public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean,
  text, smallint, smallint
) to authenticated;
