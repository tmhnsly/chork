-- 019: Competition per-venue stats RPC
--
-- Powers the organiser dashboard. Returns one row per gym linked to
-- the competition with its active-climber + send counts, so the
-- organiser can see where engagement is coming from across venues.
--
-- Access gate: caller must be the competition's organiser. Anyone
-- else gets an empty set.

create or replace function public.get_competition_venue_stats(
  p_competition_id uuid
)
returns table (
  gym_id               uuid,
  gym_name             text,
  gym_slug             text,
  set_count            int,
  active_climber_count int,
  total_sends          int,
  total_flashes        int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1 where public.is_competition_organiser(p_competition_id)
  ),
  linked as (
    select cg.gym_id from public.competition_gyms cg
     where cg.competition_id = p_competition_id
       and exists (select 1 from gate)
  ),
  comp_sets as (
    select s.id, s.gym_id
      from public.sets s
      join linked l on l.gym_id = s.gym_id
     where s.competition_id = p_competition_id
  ),
  agg as (
    select
      cs.gym_id,
      count(distinct cs.id)::int                                as set_count,
      count(distinct rl.user_id)::int                           as active_climber_count,
      coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int as total_sends,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int as total_flashes
    from comp_sets cs
    left join public.routes r on r.set_id = cs.id
    left join public.route_logs rl on rl.route_id = r.id
    group by cs.gym_id
  )
  select
    g.id        as gym_id,
    g.name      as gym_name,
    g.slug      as gym_slug,
    coalesce(a.set_count, 0)            as set_count,
    coalesce(a.active_climber_count, 0) as active_climber_count,
    coalesce(a.total_sends, 0)          as total_sends,
    coalesce(a.total_flashes, 0)        as total_flashes
  from linked l
  join public.gyms g on g.id = l.gym_id
  left join agg a on a.gym_id = l.gym_id
  order by coalesce(a.total_sends, 0) desc, g.name;
$$;

grant  execute on function public.get_competition_venue_stats(uuid) to authenticated;
revoke execute on function public.get_competition_venue_stats(uuid) from anon, public;
