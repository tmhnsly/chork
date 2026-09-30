-- public.chork_withdraw_route, as it stands.
-- Generated from supabase/migrations/116_routes_remember_the_seat.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.chork_withdraw_route(
  p_route_id uuid,
  p_player_id uuid default null
)
returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_route public.routes;
  v_set public.sets;
  v_seat public.set_players;
  result public.routes;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_route from public.routes where id = p_route_id;
  if v_route.id is null then
    raise exception 'No such route' using errcode = 'P0002';
  end if;

  select * into v_set from public.sets
   where id = v_route.set_id
     and owner_kind = 'climber'
     and game_mode = 'chork'
     and status = 'live';
  if v_set.id is null then
    raise exception 'Not a live Chork match' using errcode = 'P0002';
  end if;

  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = v_route.set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = v_route.set_id and left_at is null;
    if v_seat.user_id is not null or v_set.host_id is distinct from caller_id then
      raise exception 'Only the host can act for a guest'
        using errcode = '42501';
    end if;
  end if;

  -- Yours to take back, nobody else's. Compared by SEAT — a guest's
  -- challenge belongs to their seat, and matching on the account
  -- would let the host withdraw it as if it were their own.
  if v_route.added_by_player is distinct from v_seat.id then
    raise exception 'Only the setter can withdraw a challenge'
      using errcode = '42501';
  end if;

  if v_route.withdrawn_at is not null then
    raise exception 'Already withdrawn' using errcode = '22023';
  end if;

  -- Sent, so it IS a round — other climbers may already have spent
  -- goes answering it, and taking it back would erase their letters.
  if exists (
    select 1 from public.route_logs l
    where l.route_id = p_route_id
      and l.completed
      and (
        (v_seat.user_id is not null and l.user_id = v_seat.user_id)
        or
        (v_seat.user_id is null and l.player_id = v_seat.id)
      )
  ) then
    raise exception 'You sent this one — it is a round now'
      using errcode = '22023';
  end if;

  update public.routes
     set withdrawn_at = now(), updated_at = now()
   where id = p_route_id
  returning * into result;

  return result;
end;
$$;
