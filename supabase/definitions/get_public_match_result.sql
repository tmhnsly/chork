-- public.get_public_match_result, as it stands.
-- Generated from supabase/migrations/099_standings_handicap.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_public_match_result(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  set_row public.sets;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,64}$' then
    return null;
  end if;

  select * into set_row
  from public.sets
  where share_token = p_token
    and owner_kind = 'climber';

  if set_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'set_id', set_row.id,
    'name', set_row.name,
    'location', set_row.location,
    'started_at', set_row.starts_at,
    'ended_at', set_row.ends_at,
    'status', set_row.status,
    'handicap', set_row.handicap,
    'player_count', (
      select count(*) from public.set_players sp
      where sp.set_id = set_row.id and sp.left_at is null
    ),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rank', st.rank,
          'display_name', coalesce(p.name, sp.display_name),
          'username', p.username,
          'is_guest', (sp.user_id is null),
          'points', st.points,
          'points_tenths', st.points_tenths,
          'sends', st.sends,
          'flashes', st.flashes,
          'zones', st.zones,
          'is_winner', (st.rank = 1)
          -- `attempts` is deliberately absent. Do not add it.
        )
        order by st.rank, coalesce(p.username, sp.display_name)
      )
      from public.match_standings(set_row.id) st
      join public.set_players sp on sp.id = st.player_id
      left join public.profiles p on p.id = st.user_id
    ), '[]'::jsonb)
  );
end;
$$;
