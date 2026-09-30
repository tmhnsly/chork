-- public.chork_round_allowance, as it stands.
-- Generated from supabase/migrations/121_two_limits_on_a_mixed_day.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

CREATE OR REPLACE FUNCTION public.chork_round_allowance(p_set_id uuid, p_route_id uuid, p_player_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  v_host uuid;
  v_seat public.set_players;
  v_setter public.set_players;
  v_setter_attempts integer;
  v_grade smallint;
  v_setter_seat uuid;
  v_same_family boolean;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select host_id into v_host
  from public.sets
  where id = p_set_id and owner_kind = 'climber' and game_mode = 'chork';

  if v_host is null then
    raise exception 'Not a Chork match' using errcode = 'P0002';
  end if;

  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = p_set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = p_set_id and left_at is null;
    if v_seat.user_id is not null or v_host is distinct from caller_id then
      raise exception 'Only the host can act for a guest' using errcode = '42501';
    end if;
  end if;

  if v_seat.id is null then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  select r.added_by_player, coalesce(r.declared_grade, r.community_grade),
         coalesce(r.discipline, s.discipline) = s.discipline
           or public.discipline_family(coalesce(r.discipline, s.discipline))
              = public.discipline_family(s.discipline)
    into v_setter_seat, v_grade, v_same_family
  from public.routes r
  join public.sets s on s.id = r.set_id
  where r.id = p_route_id and r.set_id = p_set_id and r.withdrawn_at is null;

  if v_setter_seat is null then
    raise exception 'Route not in this match' using errcode = 'P0002';
  end if;

  select * into v_setter from public.set_players where id = v_setter_seat;

  -- A challenge its setter hasn't sent isn't a round, so there is no
  -- allowance to hand out and nothing to concede.
  select sl.attempts into v_setter_attempts
  from public.route_logs sl
  where sl.route_id = p_route_id
    and sl.completed
    and (
      (v_setter.user_id is not null and sl.user_id = v_setter.user_id)
      or
      (v_setter.user_id is null and sl.player_id = v_setter.id)
    );

  if v_setter_attempts is null then
    return null;
  end if;

  -- The ceiling is stated in the Match's own scale, so it says nothing
  -- about a route from the other family (migration 118). Unknown buys
  -- no bonus, exactly as an ungraded route does.
  return public.chork_allowance(
    v_setter_attempts,
    v_grade,
    case when v_same_family then v_seat.ceiling else v_seat.alt_ceiling end
  );
end;
$function$
;
