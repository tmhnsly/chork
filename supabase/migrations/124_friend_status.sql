-- ────────────────────────────────────────────────────────────────
-- How do I stand with this climber?
-- ────────────────────────────────────────────────────────────────
--
-- The profile is about to grow an action row, and "Add friend" is
-- correct in exactly one of the states it can be in. Offering it in
-- the others is how an app teaches you not to trust its buttons: you
-- tap Add on someone you already asked, nothing visibly happens
-- (`request_friend` is idempotent), and you learn to stop reading.
--
-- `is_friend` answers a boolean, which collapses "not yet asked",
-- "waiting on them", "waiting on ME" and "they said no" into one
-- word. Those need four different pieces of UI, so they need four
-- different answers.
--
-- ── Why the declined states are asymmetric ──────────────────────
--
-- Migration 104 made declining silent and one-directional: the person
-- who was declined must not be able to tell, and must not be able to
-- re-ask; the person who declined can change their mind. So a
-- declined row reads as `none` to the requester — the same as never
-- having asked — and `declined_by_me` to the addressee, who is the
-- only one allowed to act on it.
--
-- That is not a nicety. Returning `declined` to the requester would
-- leak the refusal through the UI, which is the thing 104 went out of
-- its way to prevent.

create or replace function public.friend_status(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_status text;
  i_asked boolean;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if me = p_user_id then
    return 'self';
  end if;

  -- One row per pair, unique on the UNORDERED pair (migration 104),
  -- so this matches either direction and there can only be one.
  select f.status, (f.requester_id = me)
    into row_status, i_asked
  from public.friends f
  where (f.requester_id = me and f.addressee_id = p_user_id)
     or (f.requester_id = p_user_id and f.addressee_id = me);

  if row_status is null then
    return 'none';
  end if;

  if row_status = 'active' then
    return 'friends';
  end if;

  if row_status = 'pending' then
    -- `sent` shows a waiting label; `received` is the one that should
    -- offer Accept, which is a different control entirely.
    return case when i_asked then 'sent' else 'received' end;
  end if;

  -- Declined. Silent to the person who was declined — see the header.
  return case when i_asked then 'none' else 'declined_by_me' end;
end;
$$;

revoke execute on function public.friend_status(uuid) from anon, public;
grant execute on function public.friend_status(uuid) to authenticated;
