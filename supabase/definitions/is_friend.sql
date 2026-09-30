-- public.is_friend, as it stands.
-- Generated from supabase/migrations/106_mates_to_friends.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.is_friend(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friends m
    where m.status = 'active'
      and (
        (m.requester_id = (select auth.uid()) and m.addressee_id = p_user_id)
        or
        (m.addressee_id = (select auth.uid()) and m.requester_id = p_user_id)
      )
  );
$$;
