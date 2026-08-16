-- ────────────────────────────────────────────────────────────────
-- The write RPCs were still asking the read gate
-- ────────────────────────────────────────────────────────────────
--
-- Migration 102 split `is_set_player` (reads, ignores `left_at`) from
-- `is_active_set_player` (writes, requires an unparked seat), and
-- repointed every POLICY. It did not repoint the three SECURITY
-- DEFINER functions that carry their own check — and those bypass RLS
-- by definition, so no policy was ever going to cover them:
--
--   upsert_match_log   logging a send
--   add_match_route    adding a route
--   end_match          ending it for everyone
--
-- Between 102 and this, a climber who had left a Match could still do
-- all three, through the RPCs the app actually calls. 102's own test
-- missed it by exercising a direct INSERT — the policy path — instead
-- of the RPC path. The test for this migration goes through the RPCs.
--
-- The two bodies below are the deployed definitions with ONE line
-- changed each; they were generated from `pg_get_functiondef` rather
-- than retyped, because a hand-copy had already silently dropped
-- `upsert_match_log`'s entire guest branch once.
--
-- ── And one that predates both ──────────────────────────────────
--
-- `end_match` only ever asked "are you a player". ANY player could
-- end the Match for everyone, mid-session, irreversibly — and the
-- menu offered "End match" to all of them. It is the host's now.
--
-- The dead-phone case is already covered: `end_stale_matches` runs on
-- pg_cron and archives Matches that have gone quiet, so host-only
-- cannot strand a group with a permanently live Match.

CREATE OR REPLACE FUNCTION public.add_match_route(p_set_id uuid, p_description text DEFAULT NULL::text, p_grade smallint DEFAULT NULL::smallint, p_has_zone boolean DEFAULT false, p_discipline text DEFAULT NULL::text)
 RETURNS routes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  next_number integer;
  result public.routes;
  set_scale text;
  set_status text;
  set_kind text;
  set_discipline text;
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

  select grading_scale, status, owner_kind, discipline
    into set_scale, set_status, set_kind, set_discipline
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

  select coalesce(max(number), 0) + 1 into next_number
  from public.routes
  where set_id = p_set_id;

  insert into public.routes (
    set_id, number, description, declared_grade, has_zone, added_by, discipline
  ) values (
    p_set_id,
    next_number,
    nullif(trim(coalesce(p_description, '')), ''),
    case when set_scale = 'points' then null else p_grade end,
    coalesce(p_has_zone, false),
    caller_id,
    -- Store only a genuine disagreement. Passing the Set's own
    -- discipline is normalised back to null so that changing the
    -- Set's default later still moves this route with it.
    case when p_discipline is null or p_discipline = set_discipline
         then null else p_discipline end
  )
  returning * into result;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_match_log(p_route_id uuid, p_attempts integer DEFAULT 0, p_completed boolean DEFAULT false, p_zone boolean DEFAULT false, p_player_id uuid DEFAULT NULL::uuid)
 RETURNS route_logs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  v_set_id uuid;
  v_owner_kind text;
  v_status text;
  v_host_id uuid;
  result public.route_logs;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_attempts is null or p_attempts < 0 or p_attempts > 999 then
    raise exception 'Invalid attempt count' using errcode = '22023';
  end if;

  select s.id, s.owner_kind, s.status, s.host_id
    into v_set_id, v_owner_kind, v_status, v_host_id
  from public.routes r
  join public.sets s on s.id = r.set_id
  where r.id = p_route_id;

  if v_set_id is null then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;
  if v_owner_kind <> 'climber' then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;
  if v_status <> 'live' then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;

  -- ── Guest branch ────────────────────────────────────────────────
  if p_player_id is not null then
    if v_host_id is distinct from caller_id then
      raise exception 'Only the host can log for a guest' using errcode = '42501';
    end if;
    -- Must be a GUEST seat in THIS Match. An account-backed player
    -- logs for themselves — the host doesn't get to write their card.
    if not exists (
      select 1 from public.set_players sp
      where sp.id = p_player_id
        and sp.set_id = v_set_id
        and sp.user_id is null
        and sp.left_at is null
    ) then
      raise exception 'That guest isn''t in this match' using errcode = 'P0002';
    end if;

    insert into public.route_logs (
      player_id, user_id, route_id, set_id, gym_id,
      attempts, completed, completed_at, zone
    ) values (
      p_player_id, null, p_route_id, v_set_id, null,
      coalesce(p_attempts, 0),
      coalesce(p_completed, false),
      case when coalesce(p_completed, false) then now() else null end,
      coalesce(p_zone, false)
    )
    -- The index is PARTIAL (`where player_id is not null`), so the
    -- inference has to repeat its predicate or Postgres can't match
    -- it: "no unique or exclusion constraint matching the ON CONFLICT
    -- specification".
    on conflict (player_id, route_id) where player_id is not null do update
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
  end if;

  -- ── Own log ─────────────────────────────────────────────────────
  -- Was is_set_player. A parked seat may read the board; it
  -- may not add to it. (The guest branch above is gated on the
  -- host and on the guest's own seat being unparked.)
  if not public.is_active_set_player(v_set_id) then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  insert into public.route_logs (
    user_id, route_id, set_id, gym_id, attempts, completed, completed_at, zone
  ) values (
    caller_id, p_route_id, v_set_id, null,
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
$function$
;

-- ── Ending it: the host, and only the host ────────────────────────

create or replace function public.end_match(p_set_id uuid)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result public.sets;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.sets
     set status = 'archived',
         ends_at = now()
   where id = p_set_id
     and owner_kind = 'climber'
     -- Ending is the one action that reaches other people's screens.
     and host_id = caller_id
     -- Idempotent, and the guard against a double-tap: the second
     -- update matches nothing rather than re-stamping `ends_at`.
     and status = 'live'
  returning * into result;

  if result.id is null then
    select * into result from public.sets
     where id = p_set_id and owner_kind = 'climber';

    if result.id is null then
      raise exception 'Match not found' using errcode = 'P0002';
    end if;

    -- Still live means the update was refused, not a no-op — i.e.
    -- someone who isn't the host. Already archived is a success, so a
    -- host whose first tap was slow to answer lands on the summary
    -- rather than an error.
    if result.status = 'live' then
      raise exception 'Only the host can end this match'
        using errcode = '42501';
    end if;
  end if;

  return result;
end;
$$;

revoke execute on function public.end_match(uuid) from anon, public;
grant execute on function public.end_match(uuid) to authenticated;

revoke execute on function public.add_match_route(uuid, text, smallint, boolean, text) from anon, public;
grant execute on function public.add_match_route(uuid, text, smallint, boolean, text) to authenticated;

revoke execute on function public.upsert_match_log(uuid, integer, boolean, boolean, uuid) from anon, public;
grant execute on function public.upsert_match_log(uuid, integer, boolean, boolean, uuid) to authenticated;
