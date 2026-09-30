-- public.prune_old_notifications, as it stands.
-- Generated from supabase/migrations/054_retention_cron.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.prune_old_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.notifications
   where id in (
     select id from public.notifications
      where created_at < now() - interval '90 days'
      limit 10000
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
