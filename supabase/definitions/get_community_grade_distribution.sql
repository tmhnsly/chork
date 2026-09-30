-- public.get_community_grade_distribution, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_community_grade_distribution(p_set_id uuid)
returns table (
  route_id    uuid,
  number      int,
  grade       smallint,
  vote_count  int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select
    r.id        as route_id,
    r.number,
    rl.grade_vote as grade,
    count(*)::int as vote_count
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  where r.set_id = p_set_id
    and rl.grade_vote is not null
    and exists (select 1 from gate)
  group by r.id, r.number, rl.grade_vote
  order by r.number, rl.grade_vote;
$$;
