-- public.get_match_achievement_context, as it stands.
-- Generated from supabase/migrations/141_delete_and_hide_games.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_match_achievement_context(p_user_id uuid)
returns table (
  matches_played bigint,
  matches_won bigint,
  matches_hosted bigint,
  max_players_in_won_match bigint,
  unique_coplayers bigint,
  max_iron_crew_pair_count bigint,
  match_total_flashes bigint,
  match_total_sends bigint,
  match_total_points bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with played as (
    select s.id, s.host_id
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id and sp.user_id = p_user_id and sp.left_at is null
    where s.owner_kind = 'climber'
      and s.status = 'archived'
      -- Taken off their own games (migration 141).
      and not exists (
        select 1 from public.hidden_matches hm
        where hm.set_id = s.id and hm.user_id = p_user_id
      )
  ),
  standings as (
    select pl.id as set_id, st.*
    from played pl
    cross join lateral public.match_standings(pl.id) st
  ),
  mine as (
    select sd.set_id, sd.rank, sd.sends, sd.flashes, sd.points
    from standings sd
    where sd.user_id = p_user_id
  ),
  won as (
    select m.set_id from mine m where m.rank = 1
  ),
  coplayers as (
    select sp.user_id, count(*) as together
    from played pl
    join public.set_players sp
      on sp.set_id = pl.id and sp.left_at is null
    where sp.user_id <> p_user_id
    group by sp.user_id
  )
  select
    (select count(*) from played),
    (select count(*) from won),
    (select count(*) from played where host_id = p_user_id),
    coalesce((
      select max(cnt) from (
        select count(*) as cnt
        from public.set_players sp
        where sp.set_id in (select set_id from won) and sp.left_at is null
        group by sp.set_id
      ) w
    ), 0),
    (select count(*) from coplayers),
    coalesce((select max(together) from coplayers), 0),
    coalesce((select sum(flashes) from mine), 0),
    coalesce((select sum(sends) from mine), 0),
    coalesce((select sum(points) from mine), 0);
$$;
