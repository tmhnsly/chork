-- ────────────────────────────────────────────────────────────────
-- Accepting from a profile needs the request's id
-- ────────────────────────────────────────────────────────────────
--
-- 124's `friend_status` tells the profile it is in the `received`
-- state — they asked you. The button for that state is Accept, and
-- `respond_to_friend` takes the REQUEST's id, not the climber's. So
-- the status alone leaves the profile knowing what to offer and unable
-- to do it.
--
-- Returned as a row rather than the id bolted onto the text: `status`
-- stays a plain word for every caller that only wants that, and
-- `friend_id` is null in every state where there is nothing to
-- respond to. Same asymmetry as before — a decline is silent to the
-- person declined, so they get `none` and no id.

drop function if exists public.friend_status(uuid);

create or replace function public.friend_status(p_user_id uuid)
returns table (status text, friend_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_status text;
  row_id uuid;
  i_asked boolean;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if me = p_user_id then
    return query select 'self'::text, null::uuid;
    return;
  end if;

  select f.status, f.id, (f.requester_id = me)
    into row_status, row_id, i_asked
  from public.friends f
  where (f.requester_id = me and f.addressee_id = p_user_id)
     or (f.requester_id = p_user_id and f.addressee_id = me);

  if row_status is null then
    return query select 'none'::text, null::uuid;
  elsif row_status = 'active' then
    return query select 'friends'::text, row_id;
  elsif row_status = 'pending' then
    return query select
      (case when i_asked then 'sent' else 'received' end)::text, row_id;
  else
    -- Declined. Silent to the person declined; the decliner keeps the
    -- id so they can revive it.
    if i_asked then
      return query select 'none'::text, null::uuid;
    else
      return query select 'declined_by_me'::text, row_id;
    end if;
  end if;
end;
$$;

revoke execute on function public.friend_status(uuid) from anon, public;
grant execute on function public.friend_status(uuid) to authenticated;
