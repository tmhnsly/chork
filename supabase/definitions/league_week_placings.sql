-- public.league_week_placings, as it stands.
-- Generated from supabase/migrations/134_league_placings.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.league_week_placings(p_set_id uuid)
returns table (player_id uuid, user_id uuid, rank smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select game_mode from public.sets where id = p_set_id
  ),
  -- A seat placed if it has at least one route_logs row for this
  -- set. Mirrors match_standings' seat/route_logs join exactly
  -- (121, ~160-200): guest seats keyed by player_id, account seats
  -- by user_id.
  placed as (
    select sp.id as seat_id
    from public.set_players sp
    where sp.set_id = p_set_id
      and exists (
        select 1 from public.route_logs rl
        where rl.set_id = p_set_id
          and (
            (sp.user_id is not null and rl.user_id = sp.user_id)
            or
            (sp.user_id is null and rl.player_id = sp.id)
          )
      )
  ),
  points_board as (
    select ms.player_id, ms.user_id, ms.rank
    from public.match_standings(p_set_id) ms
    join placed pl on pl.seat_id = ms.player_id
    where (select cfg.game_mode from cfg) <> 'chork'
  ),
  chork_board as (
    -- Fewest letters wins; anyone out is behind everyone still
    -- standing. Re-ranked over the PLACED rows only, so a seat that
    -- never opened a route can't occupy a place in the ordering —
    -- not even last.
    select cs.player_id, cs.user_id,
           (dense_rank() over (order by cs.is_out, cs.letters))::smallint as rank
    from public.chork_standings(p_set_id) cs
    join placed pl on pl.seat_id = cs.player_id
    where (select cfg.game_mode from cfg) = 'chork'
  )
  select * from points_board
  union all
  select * from chork_board
$$;
