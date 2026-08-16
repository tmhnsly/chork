-- ────────────────────────────────────────────────────────────────
-- Conceding a round of Chork
-- ────────────────────────────────────────────────────────────────
--
-- Letters are derived, not stored: you have one when your attempts
-- reach the allowance without a send inside it. That works while
-- you're pulling, and leaves nothing to say "I'm done with this one".
-- A climber who walks away sits unresolved forever, and the round
-- never closes for anyone.
--
-- Conceding is therefore not new state — it is the same derivation,
-- reached deliberately: set the attempt count to the allowance
-- without completing. Nothing new is stored, and undoing it is the
-- same as editing any other log.
--
-- ── Why the server has to work out the allowance ────────────────
--
-- It depends on the SETTER's attempt count, and raw attempts are
-- private to their owner (CONTEXT.md "Attempt privacy"). The client
-- can't see it, so it can't compute how many goes it has. Both these
-- functions do the sum where the numbers legally live.

-- ── 1. How many goes do I get on this round? ──────────────────────
--
-- For display as much as for conceding — "2 of 4 goes" is the whole
-- tension of an answer, and without it a climber can't tell whether
-- the next attempt is their last.

create or replace function public.chork_round_allowance(
  p_set_id uuid,
  p_route_id uuid,
  p_player_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_host uuid;
  v_seat public.set_players;
  v_setter uuid;
  v_setter_attempts integer;
  v_grade smallint;
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

  -- Your own seat, or a guest's if you host — the same split as
  -- logging, and for the same reason: a guest has no session.
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

  select r.added_by, coalesce(r.declared_grade, r.community_grade)
    into v_setter, v_grade
  from public.routes r
  where r.id = p_route_id and r.set_id = p_set_id;

  if v_setter is null then
    raise exception 'Route not in this match' using errcode = 'P0002';
  end if;

  -- A challenge its setter hasn't sent isn't a round, so there is no
  -- allowance to hand out and nothing to concede.
  select sl.attempts into v_setter_attempts
  from public.route_logs sl
  where sl.route_id = p_route_id and sl.user_id = v_setter and sl.completed;

  if v_setter_attempts is null then
    return null;
  end if;

  return public.chork_allowance(v_setter_attempts, v_grade, v_seat.ceiling);
end;
$$;

revoke execute on function public.chork_round_allowance(uuid, uuid, uuid) from anon, public;
grant execute on function public.chork_round_allowance(uuid, uuid, uuid) to authenticated;

-- ── 2. Give up on this one ────────────────────────────────────────

create or replace function public.chork_concede(
  p_set_id uuid,
  p_route_id uuid,
  p_player_id uuid default null
)
returns public.route_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_allowance integer;
  v_seat public.set_players;
  v_host uuid;
  result public.route_logs;
begin
  -- Re-runs every authorisation check; it raises on anything the
  -- caller may not do.
  v_allowance := public.chork_round_allowance(p_set_id, p_route_id, p_player_id);

  if v_allowance is null then
    raise exception 'That challenge has not been set yet' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.sets
    where id = p_set_id and status = 'live'
  ) then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;

  select host_id into v_host from public.sets where id = p_set_id;

  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = p_set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = p_set_id and left_at is null;
  end if;

  -- You cannot concede your own challenge: you set it by sending it,
  -- and the setter never answers their own round.
  if v_seat.user_id is not null and exists (
    select 1 from public.routes r
    where r.id = p_route_id and r.added_by = v_seat.user_id
  ) then
    raise exception 'You set this one' using errcode = '22023';
  end if;

  if v_seat.user_id is not null then
    insert into public.route_logs (
      user_id, route_id, set_id, gym_id, attempts, completed, zone
    )
    values (v_seat.user_id, p_route_id, p_set_id, null, v_allowance, false, false)
    on conflict (user_id, route_id) do update
      -- `greatest` so conceding never REDUCES a count someone already
      -- logged past the allowance — that would hand back a letter
      -- they had already earned.
      set attempts = greatest(public.route_logs.attempts, v_allowance),
          completed = false,
          completed_at = null,
          updated_at = now()
    returning * into result;
  else
    insert into public.route_logs (
      player_id, user_id, route_id, set_id, gym_id, attempts, completed, zone
    )
    values (v_seat.id, null, p_route_id, p_set_id, null, v_allowance, false, false)
    on conflict (player_id, route_id) where player_id is not null do update
      set attempts = greatest(public.route_logs.attempts, v_allowance),
          completed = false,
          completed_at = null,
          updated_at = now()
    returning * into result;
  end if;

  return result;
end;
$$;

revoke execute on function public.chork_concede(uuid, uuid, uuid) from anon, public;
grant execute on function public.chork_concede(uuid, uuid, uuid) to authenticated;
