-- ────────────────────────────────────────────────────────────────
-- Chork — HORSE, on a wall
-- ────────────────────────────────────────────────────────────────
--
-- Rules in CONTEXT.md. A lens on a Match, exactly like `handicap`:
-- same container, same routes, same logs, different win condition.
-- That is what "one engine" meant in the roadmap — a second mode
-- should cost a column and a standings function, not a second app.
--
-- ── Nothing new is stored ───────────────────────────────────────
--
-- No rounds table, no letters table. A round IS a route plus the log
-- its adder left on it; a letter IS a round you failed. Same rule as
-- points and community grades, and it means a mis-tapped attempt
-- corrects itself instead of leaving a letter behind forever.
--
-- ── Two homes, pinned together ──────────────────────────────────
--
-- `chork_allowance` and `chork_is_letter` mirror `allowanceFor` and
-- `roundOutcome` in `src/lib/data/chork.ts`, for the same reason
-- `compute_points` mirrors `computePoints`: the live screen computes
-- from realtime events while the server ranks in SQL.

alter table public.sets
  add column if not exists game_mode text not null default 'points'
    check (game_mode in ('points', 'chork'));

comment on column public.sets.game_mode is
  'How the Match is won. points = most points (the default). '
  'chork = HORSE; five letters and you are out. Climber-owned Matches '
  'only — a gym Set is always points.';

alter table public.sets drop constraint if exists sets_chork_climber_only_ck;
alter table public.sets add constraint sets_chork_climber_only_ck
  check (game_mode = 'points' or owner_kind = 'climber');

-- ── 1. How many goes you get ──────────────────────────────────────

create or replace function public.chork_allowance(
  p_setter_attempts integer,
  p_challenge_grade smallint,
  p_ceiling smallint
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(coalesce(p_setter_attempts, 0), 1)
       + case
           -- Unknown either side: an ungraded route, or a climber who
           -- declared no limit. Guessing is worse than not helping.
           when p_challenge_grade is null or p_ceiling is null then 0
           -- At or below your limit buys nothing.
           else greatest(0, p_challenge_grade - p_ceiling)
         end;
$$;

revoke execute on function public.chork_allowance(integer, smallint, smallint) from anon, public;
grant execute on function public.chork_allowance(integer, smallint, smallint) to authenticated;

-- ── 2. Did that cost you a letter ─────────────────────────────────
--
-- Note the shape: safe means "sent it WITHIN the allowance", not
-- "sent it". A climber who spends their goes, keeps pulling and tops
-- out on the next attempt does not get to erase the letter they
-- already earned — which a plain `not completed` test would allow.

create or replace function public.chork_is_letter(
  p_attempts integer,
  p_completed boolean,
  p_allowance integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (coalesce(p_completed, false) and coalesce(p_attempts, 0) <= p_allowance)
     and coalesce(p_attempts, 0) >= p_allowance;
$$;

revoke execute on function public.chork_is_letter(integer, boolean, integer) from anon, public;
grant execute on function public.chork_is_letter(integer, boolean, integer) to authenticated;

-- ── 3. The board ──────────────────────────────────────────────────

create or replace function public.chork_standings(p_set_id uuid)
returns table (
  player_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_guest boolean,
  letters smallint,
  is_out boolean,
  has_left boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with rounds as (
    -- A round is a route its adder has SENT. A challenge nobody set
    -- cleanly isn't a round at all, and costs nobody a letter.
    select
      r.id as route_id,
      r.added_by as setter_id,
      coalesce(r.declared_grade, r.community_grade) as grade,
      sl.attempts as setter_attempts
    from public.routes r
    join public.route_logs sl
      on sl.route_id = r.id
     and sl.user_id = r.added_by
     and sl.completed
    where r.set_id = p_set_id
      and r.added_by is not null
  ),
  answers as (
    select
      sp.id as seat_id,
      public.chork_is_letter(
        coalesce(pl.attempts, 0),
        coalesce(pl.completed, false),
        public.chork_allowance(rd.setter_attempts, rd.grade, sp.ceiling)
      ) as took_letter
    from public.set_players sp
    cross join rounds rd
    left join public.route_logs pl
      on pl.route_id = rd.route_id
     and (
       (sp.user_id is not null and pl.user_id = sp.user_id)
       or
       (sp.user_id is null and pl.player_id = sp.id)
     )
    where sp.set_id = p_set_id
      -- You don't answer your own challenge.
      and sp.user_id is distinct from rd.setter_id
  ),
  tally as (
    select
      sp.id as seat_id,
      least(
        coalesce(sum(case when a.took_letter then 1 else 0 end), 0),
        5
      )::smallint as letters
    from public.set_players sp
    left join answers a on a.seat_id = sp.id
    where sp.set_id = p_set_id
    group by sp.id
  )
  select
    sp.id,
    sp.user_id,
    p.username,
    coalesce(p.name, sp.display_name),
    p.avatar_url,
    (sp.user_id is null),
    t.letters,
    (t.letters >= 5),
    (sp.left_at is not null)
  from public.set_players sp
  join tally t on t.seat_id = sp.id
  left join public.profiles p on p.id = sp.user_id
  where sp.set_id = p_set_id
  -- Still standing first, then by letters, then by seat order — the
  -- board reads as "who is closest to winning".
  order by (t.letters >= 5), t.letters, sp.joined_at;
$$;

revoke execute on function public.chork_standings(uuid) from anon, public;
grant execute on function public.chork_standings(uuid) to authenticated, service_role;

-- ── 4. Let a host choose it at creation ───────────────────────────

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
