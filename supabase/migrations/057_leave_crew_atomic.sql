-- leave_crew_atomic — close the TOCTOU window in src/app/crew/actions.ts
--
-- The previous app-side flow was:
--   1. SELECT crews.created_by + COUNT(crew_members WHERE status='active')
--   2. Branch on (isCreator, otherActive)
--   3. Either DELETE crews (solo creator) or DELETE crew_members (member)
--
-- Between (1) and (3), another user could join. If a creator read
-- otherActive=0 and proceeded to delete the crew, a join landing in the
-- window cascades the new member out silently — FK cleanup leaves data
-- integrity intact but the UX is "you joined a crew and were instantly
-- removed for no visible reason."
--
-- This RPC moves the read + branch + write into a single transaction
-- with FOR UPDATE on the crew row, so a concurrent join either:
--   a) acquires the lock first → the leave-creator path sees them in
--      the count and returns 'creator_blocked' (no destructive action)
--   b) waits for the lock → joins AFTER the leaver completes, against
--      whatever state the leave produced (deleted crew or one less
--      active member)
--
-- Result enum:
--   'left'             — caller's crew_members row was removed
--   'crew_deleted'     — caller was the solo active creator; crew + all
--                        FK-dependent rows torn down
--   'creator_blocked'  — caller is the creator and other active members
--                        exist; transfer or remove first
--   'not_found'        — crew doesn't exist
--   'not_member'       — caller has no active membership in this crew

create or replace function public.leave_crew_atomic(p_crew_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_created_by uuid;
  v_caller_status text;
  v_other_active int;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Lock the crew row so a concurrent join (or another leave by the
  -- same user across tabs) serialises against us. The crews row is
  -- the natural lock target — crew_members rows would only lock the
  -- caller's own membership, which doesn't gate the count.
  select created_by into v_created_by
  from public.crews
  where id = p_crew_id
  for update;

  if v_created_by is null then
    return 'not_found';
  end if;

  -- Look up the caller's membership. We need it to know whether to
  -- treat them as "creator leaving" (gates on other-active count) vs
  -- "regular member leaving" (just delete their row).
  select status into v_caller_status
  from public.crew_members
  where crew_id = p_crew_id and user_id = caller_id;

  if v_caller_status is null or v_caller_status <> 'active' then
    return 'not_member';
  end if;

  if v_created_by = caller_id then
    -- Creator path: count OTHER active members (excludes self).
    select count(*) into v_other_active
    from public.crew_members
    where crew_id = p_crew_id
      and status = 'active'
      and user_id <> caller_id;

    if v_other_active > 0 then
      return 'creator_blocked';
    end if;

    -- Solo creator → tear the crew down. FK cascade on crew_members,
    -- crew_invites, etc. handles dependent rows.
    delete from public.crews where id = p_crew_id;
    return 'crew_deleted';
  end if;

  -- Regular member path.
  delete from public.crew_members
  where crew_id = p_crew_id and user_id = caller_id;
  return 'left';
end;
$$;

grant execute on function public.leave_crew_atomic(uuid) to authenticated;
revoke execute on function public.leave_crew_atomic(uuid) from anon, public;
