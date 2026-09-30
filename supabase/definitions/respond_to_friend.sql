-- public.respond_to_friend, as it stands.
-- Generated from supabase/migrations/106_mates_to_friends.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.respond_to_friend(
  p_friend_id uuid,
  p_accept boolean
)
returns public.friends
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result public.friends;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Only the person who was asked may answer, and only while it is
  -- still a question.
  update public.friends
     set status = case when coalesce(p_accept, false) then 'active' else 'declined' end,
         responded_at = now()
   where id = p_friend_id
     and addressee_id = caller_id
     and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'That request is no longer open' using errcode = 'P0002';
  end if;

  return result;
end;
$$;
