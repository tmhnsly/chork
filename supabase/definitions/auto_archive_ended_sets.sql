-- public.auto_archive_ended_sets, as it stands.
-- Generated from supabase/migrations/071_auto_archive_ended_sets.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.auto_archive_ended_sets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sets
     set status = 'archived'
   where status = 'live'
     and ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
