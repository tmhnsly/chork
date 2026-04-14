-- 035: batch RPC for crew member counts
--
-- getMyCrews() was fetching every `crew_members` row across all the
-- caller's crews (`select crew_id ... where crew_id = any(...)`) and
-- tallying in JS. One count per crew scales linearly with membership
-- size; at 3 crews × ~10 members each that's 30 rows transferred
-- just to derive three integers.
--
-- This RPC returns one row per crew with the active-member count
-- computed server-side. Scoped to crews the caller actively belongs
-- to so a stale client payload can't enumerate stranger crews.

create or replace function public.get_crew_member_counts(
  p_crew_ids uuid[]
)
returns table (
  crew_id uuid,
  count   int
)
language sql stable security definer
set search_path = ''
as $$
  with caller_crews as (
    select crew_id
      from public.crew_members
     where user_id = (select auth.uid())
       and status  = 'active'
  )
  select cm.crew_id, count(*)::int
    from public.crew_members cm
   where cm.status = 'active'
     and cm.crew_id = any(p_crew_ids)
     and cm.crew_id in (select crew_id from caller_crews)
   group by cm.crew_id;
$$;

grant  execute on function public.get_crew_member_counts(uuid[]) to authenticated;
revoke execute on function public.get_crew_member_counts(uuid[]) from anon, public;
