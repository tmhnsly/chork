-- public.get_competition_leaderboard, as it stands.
-- Generated from supabase/migrations/017_competition_leaderboard_rpc.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_competition_leaderboard(
  p_competition_id uuid,
  p_category_id   uuid default null,
  p_limit         int  default 10,
  p_offset        int  default 0
)
returns table (
  user_id     uuid,
  username    text,
  name        text,
  avatar_url  text,
  category_id uuid,
  rank        bigint,
  sends       int,
  flashes     int,
  zones       int,
  points      int
)
language sql stable security definer
set search_path = ''
as $$
  with participants as (
    select cp.user_id, cp.category_id
      from public.competition_participants cp
     where cp.competition_id = p_competition_id
       and (p_category_id is null or cp.category_id = p_category_id)
  ),
  agg as (
    select
      uss.user_id,
      p.category_id,
      sum(uss.sends)::int   as sends,
      sum(uss.flashes)::int as flashes,
      sum(uss.zones)::int   as zones,
      sum(uss.points)::int  as points
    from public.user_set_stats uss
    join public.sets s on s.id = uss.set_id
    join participants p on p.user_id = uss.user_id
    where s.competition_id = p_competition_id
    group by uss.user_id, p.category_id
    having sum(uss.points) > 0
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc) as rank
    from agg a
  )
  select
    r.user_id,
    prof.username,
    prof.name,
    prof.avatar_url,
    r.category_id,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join public.profiles prof on prof.id = r.user_id
  order by r.rank, prof.username
  limit least(coalesce(p_limit, 10), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
