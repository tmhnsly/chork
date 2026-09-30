-- public.get_route_grade, as it stands.
-- Generated from supabase/migrations/008_backend_hardening.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function get_route_grade(p_route_id uuid)
returns table (route_id uuid, community_grade integer, vote_count integer)
language sql stable security definer
set search_path = ''
as $$
  select
    rl.route_id,
    round(avg(rl.grade_vote))::integer as community_grade,
    count(rl.grade_vote)::integer as vote_count
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  join public.sets s on s.id = r.set_id
  where rl.route_id = p_route_id
    and rl.completed = true
    and rl.grade_vote is not null
    and public.is_gym_member(s.gym_id)
  group by rl.route_id;
$$;
