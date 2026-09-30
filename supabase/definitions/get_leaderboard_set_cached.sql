-- public.get_leaderboard_set_cached, as it stands.
-- Generated from supabase/migrations/039_leaderboard_cached_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_leaderboard_set_cached(
  p_gym_id uuid,
  p_set_id uuid,
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
  with set_check as (
    -- Belt-and-braces: still verify the set belongs to the gym so a
    -- mismatched (gym_id, set_id) pair returns nothing rather than
    -- leaking another gym's leaderboard via a forged cache key.
    select 1 from public.sets s
    where s.id = p_set_id and s.gym_id = p_gym_id
  ),
  ranked as (
    select
      uss.user_id,
      uss.sends,
      uss.flashes,
      uss.zones,
      uss.points,
      dense_rank() over (
        order by uss.points desc, uss.flashes desc, uss.sends desc
      ) as rank
    from public.user_set_stats uss, set_check
    where uss.set_id = p_set_id
      and uss.points > 0
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
