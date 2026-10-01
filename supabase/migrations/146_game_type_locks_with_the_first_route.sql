-- ────────────────────────────────────────────────────────────────
-- The game type locks with the first route
-- ────────────────────────────────────────────────────────────────
--
-- Setup locks once a route is up: `set_match_setup` refuses from the
-- first route on ("grading is locked"), and the live screen says so.
-- The game type never did. `set_match_game_mode` (111) checked only
-- that the caller hosts a live Match, so a host could turn a Points
-- game into Chork with routes and sends already on the wall — found in
-- a live game, route 1 up, Points to Chork from the setup pill. The two
-- modes read the same logs as different games (points and a board vs
-- letters and a pen), so a switch rewrote the game mid-play.
--
-- So it refuses once any route exists, withdrawn ones included, the
-- same test `set_match_setup` applies. The host check still comes
-- first, so a stranger learns nothing about another game's wall. The
-- create flows that set Chork straight after `create_match`
-- (GamePosters, GameSetupForm) run before any route and are unaffected.
--
-- The body starts from supabase/definitions/set_match_game_mode.sql.

create or replace function public.set_match_game_mode(
  p_set_id uuid,
  p_mode text
)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.sets;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_mode not in ('points', 'chork') then
    raise exception 'Unknown game mode' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.sets
     where id = p_set_id
       and owner_kind = 'climber'
       and status = 'live'
       and host_id = (select auth.uid())
  ) then
    raise exception 'Only the host can change a live match'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.routes where set_id = p_set_id) then
    raise exception 'The game has started — its type is locked'
      using errcode = '22023';
  end if;

  update public.sets
     set game_mode = p_mode
   where id = p_set_id
     and owner_kind = 'climber'
     and status = 'live'
     and host_id = (select auth.uid())
  returning * into result;

  if result.id is null then
    raise exception 'Only the host can change a live match'
      using errcode = '42501';
  end if;

  return result;
end;
$$;

grant execute on function public.set_match_game_mode(uuid, text) to authenticated;
revoke execute on function public.set_match_game_mode(uuid, text) from anon, public;
