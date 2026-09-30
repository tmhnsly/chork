-- public.get_leaderboard_all_time_cached, as it stands.
-- Generated from supabase/migrations/039_leaderboard_cached_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_leaderboard_all_time_cached(
  p_gym_id uuid,
  p_limit  int default 10,
  p_offset int default 0
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  rank bigint,
  sends int,
  flashes int,
  zones int,
  points int
)
language sql stable security definer
set search_path = ''
as $$
  with agg as (
    select
      uss.user_id,
      sum(uss.sends)::int   as sends,
      sum(uss.flashes)::int as flashes,
      sum(uss.zones)::int   as zones,
      sum(uss.points)::int  as points
    from public.user_set_stats uss
    where uss.gym_id = p_gym_id
    group by uss.user_id
    having sum(uss.points) > 0
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (
        order by a.points desc, a.flashes desc, a.sends desc
      ) as rank
    from agg a
  )
  select
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join public.profiles p on p.id = r.user_id
  order by r.rank, p.username
  limit least(coalesce(p_limit, 10), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
