-- public.delete_match, as it stands.
-- Generated from supabase/migrations/141_delete_and_hide_games.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.delete_match(p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.sets;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into target
    from public.sets
   where id = p_set_id
     and owner_kind = 'climber'
   for update;

  -- A non-player and a missing game get the same answer, so an id can't
  -- be probed.
  if target.id is null
     or not exists (
       select 1 from public.set_players sp
        where sp.set_id = p_set_id
          and sp.user_id = caller_id
     ) then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  if target.host_id is distinct from caller_id then
    raise exception 'Only the host can delete this game' using errcode = '42501';
  end if;

  -- A league week leaves its league first: a finished week holds
  -- placings, and the week count decides everyone's drops (134). A live
  -- week with no routes is the accidental one-tap start and counts for
  -- nothing yet, so it can go directly.
  if target.league_id is not null
     and not (
       target.status = 'live'
       and not exists (select 1 from public.routes r where r.set_id = p_set_id)
     ) then
    raise exception 'Remove this week from its league before deleting it'
      using errcode = '22023';
  end if;

  -- An invite to a game that no longer exists would open a dead join.
  delete from public.notifications
   where kind = 'match_invite_received'
     and payload ->> 'set_id' = p_set_id::text;

  delete from public.sets where id = p_set_id;

  return p_set_id;
end;
$$;
