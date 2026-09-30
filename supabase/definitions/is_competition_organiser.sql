-- public.is_competition_organiser, as it stands.
-- Generated from supabase/migrations/014_admin_foundation.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.is_competition_organiser(p_competition_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.competitions
    where id = p_competition_id
      and organiser_id = (select auth.uid())
  );
$$;
