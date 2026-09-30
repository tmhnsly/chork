-- public.join_match, as it stands.
-- Generated from supabase/migrations/084_match_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.join_match(p_set_id uuid)
returns public.set_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing public.set_players;
  active_count integer;
  set_kind text;
  set_status text;
  result public.set_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select owner_kind, status into set_kind, set_status
  from public.sets where id = p_set_id;

  if set_kind is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_kind <> 'climber' then
    -- You join a gym, not a gym Set.
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_status <> 'live' then
    raise exception 'Match has ended' using errcode = 'P0001';
  end if;

  select * into existing
  from public.set_players
  where set_id = p_set_id and user_id = caller_id;

  if existing.user_id is not null then
    if existing.left_at is null then
      return existing;
    else
      raise exception 'You have already left this match' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into active_count
  from public.set_players
  where set_id = p_set_id and left_at is null;

  if active_count >= 20 then
    raise exception 'Match is full' using errcode = 'P0001';
  end if;

  insert into public.set_players (set_id, user_id)
  values (p_set_id, caller_id)
  returning * into result;

  return result;
end;
$$;
