-- ────────────────────────────────────────────────────────────────
-- Logging a Match route
-- ────────────────────────────────────────────────────────────────
--
-- Migration 084 claimed logging needed no RPC: `route_logs` accepts a
-- Match log, 080's insert policy authorises the player branch, and
-- 081's trigger derives `set_id`. All true, and all still true — but
-- incomplete, because of one column.
--
-- `completed_at` is not a value the client can supply correctly. The
-- rule is conditional on the row's PREVIOUS state:
--
--   newly completed        → now()
--   no longer completed    → null
--   still completed        → leave it exactly as it was
--
-- A plain upsert cannot express that third case; it would restamp
-- `completed_at` every time a climber re-taps an already-sent route to
-- fix an attempt count or toggle a zone. That is not cosmetic:
-- `last_send_at` is the fourth tiebreak column in
-- `get_match_leaderboard` and `match_standings`, so a correction
-- would quietly move a climber from first-to-finish to last among
-- everyone tied on points, flashes and sends.
--
-- So the write goes through a function, exactly as `upsert_jam_log`
-- did, and for exactly that reason. Everything else about a Match log
-- stays converged: same table, same policies, same `compute_points`.

create or replace function public.upsert_match_log(
  p_route_id uuid,
  p_attempts integer default 0,
  p_completed boolean default false,
  p_zone boolean default false
)
returns public.route_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_set_id uuid;
  v_owner_kind text;
  v_status text;
  result public.route_logs;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_attempts is null or p_attempts < 0 or p_attempts > 999 then
    raise exception 'Invalid attempt count' using errcode = '22023';
  end if;

  select s.id, s.owner_kind, s.status
    into v_set_id, v_owner_kind, v_status
  from public.routes r
  join public.sets s on s.id = r.set_id
  where r.id = p_route_id;

  if v_set_id is null then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;
  -- A gym log goes through the wall's own path, which also writes
  -- activity events and evaluates badges. Refuse rather than write a
  -- half-formed gym log from here.
  if v_owner_kind <> 'climber' then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;
  if v_status <> 'live' then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;
  if not public.is_set_player(v_set_id) then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  insert into public.route_logs (
    user_id, route_id, set_id, gym_id, attempts, completed, completed_at, zone
  ) values (
    caller_id,
    p_route_id,
    v_set_id,
    null,
    coalesce(p_attempts, 0),
    coalesce(p_completed, false),
    case when coalesce(p_completed, false) then now() else null end,
    coalesce(p_zone, false)
  )
  on conflict (user_id, route_id) do update
    set attempts     = excluded.attempts,
        completed    = excluded.completed,
        completed_at = case
          when excluded.completed and not public.route_logs.completed then now()
          when not excluded.completed then null
          else public.route_logs.completed_at
        end,
        zone         = excluded.zone,
        updated_at   = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.upsert_match_log(uuid, integer, boolean, boolean) to authenticated;
revoke execute on function public.upsert_match_log(uuid, integer, boolean, boolean) from anon, public;
