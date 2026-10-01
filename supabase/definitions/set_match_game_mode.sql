-- public.set_match_game_mode, as it stands.
-- Generated from supabase/migrations/146_game_type_locks_with_the_first_route.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.set_match_game_mode(
  p_set_id uuid,
  p_mode text
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

  if p_mode not in ('points', 'chork') then
    raise exception 'Unknown game mode' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.sets
     where id = p_set_id
       and owner_kind = 'climber'
       and status = 'live'
       and host_id = (select auth.uid())
  ) then
    raise exception 'Only the host can change a live match'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.routes where set_id = p_set_id) then
    raise exception 'The game has started — its type is locked'
      using errcode = '22023';
  end if;

  update public.sets
     set game_mode = p_mode
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
