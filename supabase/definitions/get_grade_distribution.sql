-- public.get_grade_distribution, as it stands.
-- Generated from supabase/migrations/119_pyramid_reads_the_route_scale.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

CREATE OR REPLACE FUNCTION public.get_grade_distribution(p_user_id uuid)
 RETURNS TABLE(discipline text, grading_scale text, grade smallint, sends integer, flashes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with sent as (
    select
      -- A route's own discipline wins; null means it inherits the
      -- Set's (migration 091).
      coalesce(r.discipline, s.discipline) as discipline,
      -- The scale THIS ROUTE is graded on, which on a mixed day is not
      -- the Set's own (migration 117). A 6b top-rope and a V6 boulder
      -- are both ordinal 6, so reading `s.grading_scale` for every
      -- route stacked rope sends into the V pyramid and labelled them
      -- V6. Mirrors `scaleForDiscipline` in grade-label.ts.
      case
        when s.alt_grading_scale is not null
         and public.discipline_family(coalesce(r.discipline, s.discipline))
             <> public.discipline_family(s.discipline)
        then s.alt_grading_scale
        else s.grading_scale
      end as grading_scale,
      -- What the setter/adder declared, else what climbers voted.
      -- Gym routes generally have only the latter; Match routes
      -- generally only the former.
      coalesce(r.declared_grade, r.community_grade) as grade,
      (rl.attempts = 1) as is_flash
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where rl.user_id = p_user_id
      and rl.completed
  )
  select
    sent.discipline,
    -- A send with no resolvable grade, or on a scale whose numbers
    -- aren't comparable between Sets, collapses into one bucket the
    -- UI reports as "not graded" rather than silently dropping.
    -- `points` has no grades at all; `custom` ordinals mean something
    -- different in every Match, so stacking them would be nonsense.
    case
      when sent.grading_scale in ('v', 'font', 'yds', 'french')
       and sent.grade is not null
      then sent.grading_scale
      else null
    end as grading_scale,
    case
      when sent.grading_scale in ('v', 'font', 'yds', 'french')
      then sent.grade
      else null
    end as grade,
    count(*)::integer as sends,
    count(*) filter (where sent.is_flash)::integer as flashes
  from sent
  group by 1, 2, 3
  order by 1, 2, 3;
$function$
;
