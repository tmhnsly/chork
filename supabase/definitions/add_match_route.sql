-- public.add_match_route, as it stands.
-- Generated from supabase/migrations/116_routes_remember_the_seat.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.add_match_route(
  p_set_id uuid,
  p_description text default null,
  p_grade smallint default null,
  p_has_zone boolean default false,
  p_discipline text default null,
  p_player_id uuid default null
)
returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_number integer;
  result public.routes;
  set_scale text;
  set_status text;
  set_kind text;
  set_discipline text;
  set_host uuid;
  v_seat public.set_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_discipline is not null
     and p_discipline not in ('boulder', 'sport', 'top-rope') then
    raise exception 'Invalid discipline' using errcode = '22023';
  end if;

  -- Was is_set_player, which migration 102 widened to include
  -- parked seats. Adding a route is a write.
  if not public.is_active_set_player(p_set_id) then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  select grading_scale, status, owner_kind, discipline, host_id
    into set_scale, set_status, set_kind, set_discipline, set_host
  from public.sets
  where id = p_set_id
  for update;

  if set_scale is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_kind <> 'climber' then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_status <> 'live' then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;

  -- Your own seat, or a guest's if you host — the same split as
  -- logging and conceding, and for the same reason: a guest has no
  -- session, so the host acts for them.
  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = p_set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = p_set_id and left_at is null;
    if v_seat.user_id is not null or set_host is distinct from caller_id then
      raise exception 'Only the host can act for a guest'
        using errcode = '42501';
    end if;
  end if;

  if v_seat.id is null then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  select coalesce(max(number), 0) + 1 into next_number
  from public.routes
  where set_id = p_set_id;

  insert into public.routes (
    set_id, number, description, declared_grade, has_zone,
    added_by, added_by_player, discipline
  ) values (
    p_set_id,
    next_number,
    nullif(trim(coalesce(p_description, '')), ''),
    case when set_scale = 'points' then null else p_grade end,
    coalesce(p_has_zone, false),
    -- The account, when there is one. Null for a guest — which is the
    -- whole point of the column beside it.
    v_seat.user_id,
    v_seat.id,
    -- Store only a genuine disagreement. Passing the Set's own
    -- discipline is normalised back to null so that changing the
    -- Set's default later still moves this route with it.
    case when p_discipline is null or p_discipline = set_discipline
         then null else p_discipline end
  )
  returning * into result;

  return result;
end;
$$;
