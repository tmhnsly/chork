-- public.get_match_history, as it stands.
-- Generated from supabase/migrations/141_delete_and_hide_games.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_match_history(
  p_user_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  set_id uuid,
  name text,
  location text,
  ended_at timestamptz,
  started_at timestamptz,
  duration_seconds integer,
  player_count smallint,
  handicap boolean,
  user_rank smallint,
  user_sends smallint,
  user_flashes smallint,
  user_points smallint,
  user_points_tenths integer,
  user_is_winner boolean,
  winner_user_id uuid,
  winner_username text,
  winner_display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select s.id, s.name, s.location, s.starts_at, s.ends_at, s.handicap
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id and sp.user_id = p_user_id and sp.left_at is null
    where s.owner_kind = 'climber'
      and s.status = 'archived'
      and s.ends_at is not null
      -- Taken off their own games (migration 141).
      and not exists (
        select 1 from public.hidden_matches hm
        where hm.set_id = s.id and hm.user_id = p_user_id
      )
      and (p_before is null or s.ends_at < p_before)
      -- An ended lobby that never had a route isn't a game.
      and exists (select 1 from public.routes r where r.set_id = s.id)
    order by s.ends_at desc
    limit least(coalesce(p_limit, 20), 100)
  ),
  standings as (
    select m.id as set_id, st.*
    from mine m
    cross join lateral public.match_standings(m.id) st
  ),
  winner as (
    select distinct on (sd.set_id)
      sd.set_id, sd.user_id, sd.player_id,
      coalesce(p.name, sp.display_name) as display_name,
      p.username
    from standings sd
    join public.set_players sp on sp.id = sd.player_id
    left join public.profiles p on p.id = sd.user_id
    where sd.rank = 1
    order by sd.set_id, sd.player_id
  )
  select
    m.id,
    m.name,
    m.location,
    m.ends_at,
    m.starts_at,
    greatest(extract(epoch from (m.ends_at - m.starts_at))::integer, 0),
    (select count(*)::smallint from public.set_players sp
      where sp.set_id = m.id and sp.left_at is null),
    m.handicap,
    mine_st.rank,
    mine_st.sends,
    mine_st.flashes,
    mine_st.points,
    mine_st.points_tenths,
    (mine_st.rank = 1),
    w.user_id,
    w.username,
    w.display_name
  from mine m
  join standings mine_st
    on mine_st.set_id = m.id and mine_st.user_id = p_user_id
  left join winner w on w.set_id = m.id
  order by m.ends_at desc;
$$;
