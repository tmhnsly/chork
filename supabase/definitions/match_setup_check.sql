-- public.match_setup_check, as it stands.
-- Generated from supabase/migrations/136_match_setup.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
