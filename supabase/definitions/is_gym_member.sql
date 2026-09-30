-- public.is_gym_member, as it stands.
-- Generated from supabase/migrations/012_db_hardening_rls_indexes_constraints.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function is_gym_member(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_memberships
    where user_id = (select auth.uid()) and gym_id = p_gym_id
  );
$$;
