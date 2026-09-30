-- public.upsert_match_log, as it stands.
-- Generated from supabase/migrations/103_write_rpcs_use_the_write_gate.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
