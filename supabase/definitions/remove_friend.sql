-- public.remove_friend, as it stands.
-- Generated from supabase/migrations/106_mates_to_friends.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from public.friends m
  where least(m.requester_id, m.addressee_id) = least(caller_id, p_user_id)
    and greatest(m.requester_id, m.addressee_id) = greatest(caller_id, p_user_id)
    and (m.requester_id = caller_id or m.addressee_id = caller_id);
end;
$$;
