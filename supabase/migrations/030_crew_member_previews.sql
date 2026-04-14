-- 030: batch RPC for crew member previews
--
-- The /crew picker renders up to 4 avatars per crew card. Without a
-- batch, we were issuing one `crew_members + profiles` query per
-- crew — fine up to ~10 crews but bounded growth isn't a plan.
-- This RPC takes an array of crew IDs and returns the first N active
-- members per crew (by join order), one row per (crew_id, member).
-- RLS on crew_members already gates visibility; this RPC restricts
-- further to crews the caller is actively in so a stale client
-- payload can't enumerate strangers' crew rosters.

create or replace function public.get_crew_member_previews(
  p_crew_ids uuid[],
  p_limit    int default 4
)
returns table (
  crew_id    uuid,
  user_id    uuid,
  username   text,
  name       text,
  avatar_url text,
  joined_at  timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  with caller_crews as (
    select crew_id
      from public.crew_members
     where user_id = (select auth.uid())
       and status  = 'active'
  ),
  ranked as (
    select
      cm.crew_id,
      cm.user_id,
      p.username,
      p.name,
      p.avatar_url,
      cm.created_at as joined_at,
      row_number() over (
        partition by cm.crew_id
        order by cm.created_at asc
      ) as rn
    from public.crew_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.status = 'active'
      and cm.crew_id = any(p_crew_ids)
      and cm.crew_id in (select crew_id from caller_crews)
  )
  select crew_id, user_id, username, name, avatar_url, joined_at
    from ranked
   where rn <= greatest(1, least(coalesce(p_limit, 4), 10));
$$;

grant  execute on function public.get_crew_member_previews(uuid[], int) to authenticated;
revoke execute on function public.get_crew_member_previews(uuid[], int) from anon, public;
