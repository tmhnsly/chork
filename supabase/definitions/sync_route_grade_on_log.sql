-- public.sync_route_grade_on_log, as it stands.
-- Generated from supabase/migrations/026_denormalise_community_grade.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.sync_route_grade_on_log()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Only recompute when the vote or completion state actually moved
  -- — skips cost on every attempts++ which doesn't touch the grade.
  if (tg_op = 'INSERT') then
    if new.grade_vote is not null and new.completed then
      perform public.recompute_route_grade(new.route_id);
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if new.grade_vote is distinct from old.grade_vote
       or new.completed is distinct from old.completed then
      perform public.recompute_route_grade(new.route_id);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.grade_vote is not null and old.completed then
      perform public.recompute_route_grade(old.route_id);
    end if;
    return old;
  end if;
  return null;
end;
$$;
