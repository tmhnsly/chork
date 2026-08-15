-- ────────────────────────────────────────────────────────────────
-- Discipline: boulder, sport, top-rope
-- ────────────────────────────────────────────────────────────────
--
-- Chork is not boulder-only. See CONTEXT.md "Discipline" for the
-- decisions this implements; the short version:
--
--   • Set at the Set level as a DEFAULT, overridable PER ROUTE. A gym
--     admin picks one for a whole Set; a climber logging an outdoor
--     day mixes boulders and ropes freely within one Match.
--   • It changes which grade scale is offered, and what partial
--     credit is called (a boulder's zone is a rope's highpoint).
--   • It does NOT change scoring. `compute_points` reads attempts,
--     completed and zone, and never grade — so a V4 and a 6a+ already
--     share one points total with no equivalence to invent. Keeping
--     it that way is what stops every future game mode having to be
--     built three times.
--
-- `routes.discipline` is nullable ON PURPOSE: null means "inherit the
-- Set's". That way changing a Set's discipline moves every route that
-- never disagreed, and the only rows carrying a value are the ones
-- that genuinely differ.

-- ── 1. Disciplines ────────────────────────────────────────────────

alter table public.sets
  add column if not exists discipline text not null default 'boulder'
    check (discipline in ('boulder', 'sport', 'top-rope'));

alter table public.routes
  add column if not exists discipline text
    check (discipline is null or discipline in ('boulder', 'sport', 'top-rope'));

comment on column public.sets.discipline is
  'Default discipline for this Set''s routes. See CONTEXT.md.';
comment on column public.routes.discipline is
  'Overrides the Set''s discipline. NULL = inherit, which is the '
  'common case — only a route that genuinely differs stores a value.';

-- Every existing row is a boulder: Chork shipped boulder-only, and
-- the column default has already backfilled `sets`. `routes` stays
-- null throughout, which reads as "inherit" — correct, not missing.

-- ── 2. Rope grading scales ────────────────────────────────────────
--
-- Ropes need their own scales. Note `french` (sport: 6a, 6a+, 7a…) is
-- a different system from `font` (boulder: 6A, 6A+, 7A…) despite the
-- resemblance — the case difference is the convention that tells them
-- apart, and conflating them would misgrade every rope climb by a
-- wide margin.
alter table public.sets drop constraint if exists sets_grading_scale_check;
alter table public.sets add constraint sets_grading_scale_check
  check (grading_scale in ('v', 'font', 'points', 'custom', 'yds', 'french'));

-- ── 3. The scale must suit the discipline ─────────────────────────
--
-- Deliberately NOT a CHECK constraint. A Set's discipline is only a
-- default and its routes may each differ, so "the Set's scale matches
-- the Set's discipline" is not an invariant — a mixed outdoor Match
-- on a `custom` ladder is a legitimate shape. The app offers the
-- right scales per discipline at the point of choosing; this comment
-- exists so the absence of a constraint reads as a decision rather
-- than an oversight.
--
-- The pairing the UI enforces:
--   boulder            → v, font
--   sport / top-rope   → yds, french
--   any                → points, custom

-- ── 4. Grade ceilings move with the scale ─────────────────────────
--
-- `max_grade` / `min_grade` are indices into whichever scale is in
-- use, bounded 0..30 by their existing CHECKs. The rope scales are
-- longer than the boulder ones (YDS runs to 5.15d) but still fit
-- inside 30, so no constraint changes. Recorded because "why is the
-- bound 30 and not 21" is otherwise a puzzle: it was chosen with
-- headroom for exactly this.
