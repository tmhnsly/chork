-- public.recompute_route_grade, as it stands.
-- Generated from supabase/migrations/026_denormalise_community_grade.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.recompute_route_grade(p_route_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.routes r
     set community_grade = sub.community_grade,
         grade_vote_count = sub.vote_count
    from (
      select round(avg(rl.grade_vote))::smallint as community_grade,
             count(rl.grade_vote)::integer       as vote_count
        from public.route_logs rl
       where rl.route_id = p_route_id
         and rl.completed = true
         and rl.grade_vote is not null
    ) as sub
   where r.id = p_route_id;
end;
$$;
