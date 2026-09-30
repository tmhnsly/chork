-- public.sync_sets_active, as it stands.
-- Generated from supabase/migrations/014_admin_foundation.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.sync_sets_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.active := (new.status = 'live');
  return new;
end;
$$;
