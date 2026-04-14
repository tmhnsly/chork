-- 029: crew activity feed — optional `p_crew_id` scope
--
-- The original feed RPC (migration 022) returns activity across every
-- crew the caller is active in. The per-crew detail page needs to
-- scope that to a single crew server-side so pagination lands on the
-- right rows without the client having to filter.
--
-- Overload: create a new signature with a leading `p_crew_id uuid`.
-- The no-arg call path used by the /crew home stays on the old
-- signature. When `p_crew_id` is provided, results are restricted to
-- crew-mates who share THAT crew with the caller (still never the
-- caller themselves) and the caller must be an active member of
-- that crew — otherwise nothing is returned.

create or replace function public.get_crew_activity_feed(
  p_crew_id uuid,
  p_limit   int  default 30,
  p_before  timestamptz default null
)
returns table (
  route_log_id uuid,
  user_id      uuid,
  username     text,
  avatar_url   text,
  route_id     uuid,
  route_number int,
  set_id       uuid,
  set_name     text,
  set_starts_at timestamptz,
  set_ends_at   timestamptz,
  gym_id       uuid,
  gym_name     text,
  is_flash     boolean,
  is_zone      boolean,
  happened_at  timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  with caller_member as (
    -- Gate: the caller must actively belong to the requested crew.
    -- Returns zero rows otherwise, which makes the join downstream
    -- yield nothing — no leak possible.
    select 1
      from public.crew_members
     where crew_id = p_crew_id
       and user_id = (select auth.uid())
       and status  = 'active'
  ),
  crew_mates as (
    select distinct cm.user_id
      from public.crew_members cm
      join caller_member on true
     where cm.crew_id = p_crew_id
       and cm.status  = 'active'
       and cm.user_id <> (select auth.uid())
  )
  select
    rl.id           as route_log_id,
    rl.user_id,
    p.username,
    p.avatar_url,
    r.id            as route_id,
    r.number        as route_number,
    s.id            as set_id,
    s.name          as set_name,
    s.starts_at     as set_starts_at,
    s.ends_at       as set_ends_at,
    g.id            as gym_id,
    g.name          as gym_name,
    (rl.attempts = 1)  as is_flash,
    rl.zone            as is_zone,
    rl.updated_at   as happened_at
  from public.route_logs rl
  join crew_mates cm on cm.user_id = rl.user_id
  join public.routes   r on r.id = rl.route_id
  join public.sets     s on s.id = r.set_id
  join public.gyms     g on g.id = s.gym_id
  join public.profiles p on p.id = rl.user_id
  where rl.completed = true
    and (p_before is null or rl.updated_at < p_before)
  order by rl.updated_at desc
  limit least(coalesce(p_limit, 30), 100);
$$;

grant  execute on function public.get_crew_activity_feed(uuid, int, timestamptz) to authenticated;
revoke execute on function public.get_crew_activity_feed(uuid, int, timestamptz) from anon, public;
