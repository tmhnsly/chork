-- public.chork_concede, as it stands.
-- Generated from supabase/migrations/116_routes_remember_the_seat.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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

  -- You cannot concede your own challenge — you end that turn by
  -- withdrawing it. Compared by SEAT so it holds for a guest too.
  if exists (
    select 1 from public.routes r
    where r.id = p_route_id and r.added_by_player = v_seat.id
  ) then
    raise exception 'You set this one — take it back instead'
      using errcode = '22023';
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
