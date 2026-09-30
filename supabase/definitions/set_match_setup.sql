-- public.set_match_setup, as it stands.
-- Generated from supabase/migrations/136_match_setup.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
