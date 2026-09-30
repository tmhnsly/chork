-- public.bump_set_last_activity, as it stands.
-- Generated from supabase/migrations/084_match_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.bump_set_last_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sets
     set last_activity_at = now()
   where id = new.set_id
     and owner_kind = 'climber';
  return new;
end;
$$;
