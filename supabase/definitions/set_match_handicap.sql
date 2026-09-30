-- public.set_match_handicap, as it stands.
-- Generated from supabase/migrations/100_match_settings.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.set_match_handicap(
  p_set_id uuid,
  p_enabled boolean
)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.sets;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.sets
     set handicap = coalesce(p_enabled, false)
   where id = p_set_id
     and owner_kind = 'climber'
     and status = 'live'
     and host_id = (select auth.uid())
  returning * into result;

  if result.id is null then
    raise exception 'Only the host can change a live match'
      using errcode = '42501';
  end if;

  return result;
end;
$$;
