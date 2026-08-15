-- ────────────────────────────────────────────────────────────────
-- Grade distribution: the pyramid on a climber's profile
-- ────────────────────────────────────────────────────────────────
--
-- How many routes a climber has sent at each grade, and how many of
-- those were flashes. Design decisions were settled in the header of
-- migration 076 (`jam_grade_retention`) — per-(climber, grade)
-- rollup, attempts deliberately absent, visible to any signed-in
-- user, and the UI must say what it excluded.
--
-- **076's storage plan is void**, and this replaces it. That approach
-- snapshotted per-grade counts into `jam_summary_grades` when a jam
-- ended, which meant a table to keep in sync, a gym half that had no
-- equivalent, and — as it turned out — 0 rows ever written, because
-- nothing read it. The Set convergence removed the reason for any of
-- that: a Match send is an ordinary `route_logs` row now, so gym and
-- Match sends roll up together, live, with no snapshot and no
-- backfill.
--
-- Two things this deliberately does NOT do:
--
--   • **No attempts, in or out.** Sends and flashes only. Flash is
--     already public (it's a leaderboard column); raw attempt counts
--     are owner-only — see CONTEXT.md "Attempt privacy".
--   • **No cross-scale conversion.** A 6a+ is not a V-grade and never
--     renders as one, so the rollup is keyed by (discipline, scale)
--     and the UI draws one pyramid per key. This is the decision that
--     replaced 076's "convert at display to the climber's most-used
--     scale", which pre-dated multi-discipline and breaks the moment
--     someone logs both boulders and ropes.

create or replace function public.get_grade_distribution(p_user_id uuid)
returns table (
  discipline text,
  grading_scale text,
  grade smallint,
  sends integer,
  flashes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with sent as (
    select
      -- A route's own discipline wins; null means it inherits the
      -- Set's (migration 091).
      coalesce(r.discipline, s.discipline) as discipline,
      s.grading_scale,
      -- What the setter/adder declared, else what climbers voted.
      -- Gym routes generally have only the latter; Match routes
      -- generally only the former.
      coalesce(r.declared_grade, r.community_grade) as grade,
      (rl.attempts = 1) as is_flash
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where rl.user_id = p_user_id
      and rl.completed
  )
  select
    sent.discipline,
    -- A send with no resolvable grade, or on a scale whose numbers
    -- aren't comparable between Sets, collapses into one bucket the
    -- UI reports as "not graded" rather than silently dropping.
    -- `points` has no grades at all; `custom` ordinals mean something
    -- different in every Match, so stacking them would be nonsense.
    case
      when sent.grading_scale in ('v', 'font', 'yds', 'french')
       and sent.grade is not null
      then sent.grading_scale
      else null
    end as grading_scale,
    case
      when sent.grading_scale in ('v', 'font', 'yds', 'french')
      then sent.grade
      else null
    end as grade,
    count(*)::integer as sends,
    count(*) filter (where sent.is_flash)::integer as flashes
  from sent
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

-- Service-role only, like every other RPC that takes its subject as
-- an argument. The profile page has already resolved whose profile is
-- being viewed before it asks.
revoke execute on function public.get_grade_distribution(uuid) from anon, authenticated, public;
grant execute on function public.get_grade_distribution(uuid) to service_role;
