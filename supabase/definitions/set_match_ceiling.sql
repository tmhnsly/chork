-- public.set_match_ceiling, as it stands.
-- Generated from supabase/migrations/121_two_limits_on_a_mixed_day.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.set_match_ceiling(
  p_set_id uuid,
  p_player_id uuid,
  p_ceiling smallint default null,
  p_alt_ceiling smallint default null
)
returns public.set_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_host_id uuid;
  v_seat_user uuid;
  result public.set_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_ceiling is not null and (p_ceiling < 0 or p_ceiling > 30) then
    raise exception 'Ceiling out of range' using errcode = '22023';
  end if;

  if p_alt_ceiling is not null and (p_alt_ceiling < 0 or p_alt_ceiling > 30) then
    raise exception 'Ceiling out of range' using errcode = '22023';
  end if;

  select s.host_id into v_host_id
  from public.sets s
  where s.id = p_set_id and s.owner_kind = 'climber' and s.status = 'live';

  if v_host_id is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;

  select sp.user_id into v_seat_user
  from public.set_players sp
  where sp.id = p_player_id and sp.set_id = p_set_id and sp.left_at is null;

  if not found then
    raise exception 'That player isn''t in this match' using errcode = 'P0002';
  end if;

  -- Your own seat, or a guest's if you host.
  if v_seat_user is distinct from caller_id
     and not (v_seat_user is null and v_host_id = caller_id) then
    raise exception 'You can only set your own ceiling'
      using errcode = '42501';
  end if;

  update public.set_players
     set ceiling = p_ceiling,
         alt_ceiling = p_alt_ceiling
   where id = p_player_id
  returning * into result;

  return result;
end;
$$;
