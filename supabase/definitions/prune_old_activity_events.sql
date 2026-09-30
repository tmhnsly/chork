-- public.prune_old_activity_events, as it stands.
-- Generated from supabase/migrations/054_retention_cron.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.prune_old_activity_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.activity_events
   where id in (
     select id from public.activity_events
      where created_at < now() - interval '365 days'
      limit 10000
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
