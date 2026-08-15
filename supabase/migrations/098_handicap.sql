-- ────────────────────────────────────────────────────────────────
-- Handicap: a V2 climber and a V6 climber on one board
-- ────────────────────────────────────────────────────────────────
--
-- An optional lens for a Match. A send counts for most when it is at
-- the climber's own limit and tapers to nothing three grades below,
-- so both climbers compete against themselves.
--
-- **Matches only, never gym Sets.** A gym Set carries the gym's name
-- and eventually prizes, so its scoring has to be comparable and
-- ungameable; a handicap is self-declared and inherently soft. The
-- CHECK below enforces that rather than trusting callers.
--
-- ── Why the cutoff ──────────────────────────────────────────────
--
-- A stronger climber doesn't out-score a weaker one per route — on a
-- route both can flash, both score 4. They win on VOLUME, because
-- every route below their limit is a route they can add. So any tail
-- at all re-tilts the board. Measured over a V0–V6 session:
--
--     taper 1/.7/.4/.2 + floor .1   V2 4.7  V6 6.7   ratio 1.43
--     taper 1/.7/.4/.15             V2 4.7  V6 5.3   ratio 1.13
--     taper 1/.7/.4, then nothing   V2 4.7  V6 4.7   ratio 1.00
--
-- Hence: only routes within two grades of your limit count.
--
-- ── Two homes, pinned together ──────────────────────────────────
--
-- This mirrors `handicapMultiplier` in `src/lib/data/handicap.ts`,
-- for the same reason `compute_points` mirrors `computePoints`: the
-- live board is recomputed client-side from realtime events while the
-- server ranks in SQL. `scoring-parity.test.ts` evaluates one against
-- the other, so a one-sided edit fails the suite instead of silently
-- forking the formula.

-- ── 1. Opt in, per Match ──────────────────────────────────────────

alter table public.sets
  add column if not exists handicap boolean not null default false;

alter table public.sets drop constraint if exists sets_handicap_climber_only_ck;
alter table public.sets add constraint sets_handicap_climber_only_ck
  check (not handicap or owner_kind = 'climber');

comment on column public.sets.handicap is
  'Score relative to each player''s declared ceiling. Matches only — '
  'a gym Set''s scoring has to be comparable and ungameable.';

-- ── 2. The climber's ceiling, in this Match's scale ───────────────
--
-- Per-Match rather than on the profile, deliberately: a ceiling only
-- means anything alongside a scale, and a Match already has exactly
-- one. Putting it on `profiles` would need a (discipline, scale,
-- grade) triple and a conversion at read time — and there is no
-- honest conversion between a V-grade and a French one.
--
-- Guests get one too. The host declares it, same as they enter the
-- sends.

alter table public.set_players
  add column if not exists ceiling smallint
    check (ceiling is null or ceiling between 0 and 30);

comment on column public.set_players.ceiling is
  'This player''s limit, as an index into the Match''s grading scale. '
  'Null = no handicap for them; they score base points.';

-- ── 3. The multiplier ─────────────────────────────────────────────

create or replace function public.handicap_multiplier(
  p_route_grade smallint,
  p_ceiling smallint
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    -- At or above your limit: full value, never more. A bonus above
    -- would make declaring a low ceiling strictly better than being
    -- honest, and a number everyone games is worse than no number.
    when p_route_grade is null or p_ceiling is null then 1.0
    when p_ceiling - p_route_grade <= 0 then 1.0
    when p_ceiling - p_route_grade = 1 then 0.7
    when p_ceiling - p_route_grade = 2 then 0.4
    -- Further below: nothing. This is the balance mechanism, not an
    -- oversight — a warm-up costs a strong climber nothing, so it
    -- earns them nothing.
    else 0.0
  end::numeric;
$$;

revoke execute on function public.handicap_multiplier(smallint, smallint) from anon, public;
grant execute on function public.handicap_multiplier(smallint, smallint) to authenticated;

/**
 * Handicapped points for one send, in TENTHS.
 *
 * Integer tenths rather than a float so totals sum exactly. Falls
 * back to plain base points when the handicap can't apply — an
 * ungraded route, or a player who hasn't declared a ceiling — because
 * scoring them zero would be worse than scoring them plainly.
 */
create or replace function public.handicap_points_tenths(
  p_attempts integer,
  p_completed boolean,
  p_zone boolean,
  p_route_grade smallint,
  p_ceiling smallint
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_route_grade is null or p_ceiling is null
      then public.compute_points(p_attempts, p_completed, p_zone) * 10
    else round(
      public.compute_points(p_attempts, p_completed, p_zone)
      * public.handicap_multiplier(p_route_grade, p_ceiling)
      * 10
    )::integer
  end;
$$;

revoke execute on function public.handicap_points_tenths(integer, boolean, boolean, smallint, smallint) from anon, public;
grant execute on function public.handicap_points_tenths(integer, boolean, boolean, smallint, smallint) to authenticated;
