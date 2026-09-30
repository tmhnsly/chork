-- public.end_stale_matches, as it stands.
-- Generated from supabase/migrations/137_empty_lobbies.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.end_stale_matches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_count integer;
begin
  with stale as (
    update public.sets s
       set status = 'archived',
           ends_at = now()
     where s.owner_kind = 'climber'
       and s.status = 'live'
       and (
         coalesce(s.last_activity_at, s.starts_at) < now() - interval '24 hours'
         -- A lobby nobody put a route up in: a warm-up and a wait for
         -- friends fit in 3 hours, yesterday's lobby does not.
         or (
           coalesce(s.last_activity_at, s.starts_at) < now() - interval '3 hours'
           and not exists (select 1 from public.routes r where r.set_id = s.id)
         )
       )
    returning s.id
  )
  select count(*) into ended_count from stale;

  return ended_count;
end;
$$;
