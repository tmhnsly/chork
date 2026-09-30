-- public.friend_status, as it stands.
-- Generated from supabase/migrations/125_friend_status_carries_the_row.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
