-- public.is_gym_owner, as it stands.
-- Generated from supabase/migrations/014_admin_foundation.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.is_gym_owner(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_admins
    where gym_id = p_gym_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;
