-- public.get_league, as it stands.
-- Generated from supabase/migrations/134_league_placings.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_league(p_league_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  l public.leagues;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.league_visible_to(p_league_id, caller_id) then
    return null;
  end if;
  select * into l from public.leagues where id = p_league_id;

  return jsonb_build_object(
    'league', to_jsonb(l),
    'is_host', (l.host_id = caller_id),
    -- Every set carrying this league_id, INCLUDING a live one still
    -- in progress — a running week belongs on the list. week_count
    -- and league_standings itself only count `status = 'archived'`
    -- weeks; an unfinished week has no board yet.
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'set_id', s.id,
        'name', s.name,
        'status', s.status,
        'game_mode', s.game_mode,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'player_count', (select count(*) from public.set_players sp where sp.set_id = s.id),
        'winner_user_id', (
          case when s.status = 'archived' then
            (select lwp.user_id from public.league_week_placings(s.id) lwp
              where lwp.rank = 1 and lwp.user_id is not null limit 1)
          else null end
        )
      ) order by s.starts_at desc)
      from public.sets s
      where s.league_id = p_league_id
    ), '[]'::jsonb)
  );
end;
$$;
