-- ────────────────────────────────────────────────────────────────
-- The host enters a guest's send
-- ────────────────────────────────────────────────────────────────
--
-- Migration 095's policies already let the host write a guest's log
-- directly, so this could have been a plain upsert from the app. It
-- isn't, for the same reason `upsert_match_log` exists at all:
-- `completed_at` depends on the row's PREVIOUS state ("still
-- completed → leave it alone"), which a plain upsert can't express.
-- Restamping it reorders tied players, because `last_send_at` is the
-- board's fourth tiebreak — and a guest is exactly as entitled to
-- keep their place in a tie as anyone else.
--
-- `p_player_id` names the guest seat. Null keeps the previous
-- meaning exactly — log for yourself — so every existing caller is
-- unaffected.

create or replace function public.upsert_match_log(
  p_route_id uuid,
  p_attempts integer default 0,
  p_completed boolean default false,
  p_zone boolean default false,
  p_player_id uuid default null
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
  if not public.is_set_player(v_set_id) then
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
$$;

drop function if exists public.upsert_match_log(uuid, integer, boolean, boolean);

grant execute on function public.upsert_match_log(uuid, integer, boolean, boolean, uuid) to authenticated;
revoke execute on function public.upsert_match_log(uuid, integer, boolean, boolean, uuid) from anon, public;
