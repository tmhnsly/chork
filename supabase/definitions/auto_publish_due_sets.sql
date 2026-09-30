-- public.auto_publish_due_sets, as it stands.
-- Generated from supabase/migrations/070_auto_publish_requires_routes.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.auto_publish_due_sets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sets
     set status = 'live'
   where status = 'draft'
     and starts_at <= now()
     and exists (select 1 from public.routes r where r.set_id = sets.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
