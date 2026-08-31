-- ────────────────────────────────────────────────────────────────
-- Grade progression: when the ceiling moved
-- ────────────────────────────────────────────────────────────────
--
-- The pyramid (migration 094) answers "how much at each grade"; this
-- answers "when did the ceiling move" — the best grade sent in each
-- calendar month, per (discipline, scale), and whether that month's
-- best was flashed.
--
-- Same source, same guards, same privacy stance as 094:
--
--   • Sends and flashes only — no attempts, in or out. Raw attempt
--     counts are owner-only; see CONTEXT.md "Attempt privacy".
--   • No cross-scale conversion. One series per (discipline, scale),
--     drawn separately, exactly like the pyramids.
--   • Ungradable sends (points-only Sets, custom ladders, no grade
--     yet) are simply absent here — the pyramid's "not graded"
--     footnote already accounts for them, and a monthly BEST of an
--     incomparable ordinal would be nonsense.
--
-- A month's best_was_flash is true when ANY send at that month's best
-- grade was a flash — the flag describes the ceiling, not the month.

create or replace function public.get_grade_progression(p_user_id uuid)
returns table (
  month date,
  discipline text,
  grading_scale text,
  best_grade smallint,
  best_was_flash boolean
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
      -- What the setter/adder declared, else what climbers voted —
      -- the same precedence the pyramid uses.
      coalesce(r.declared_grade, r.community_grade) as grade,
      (rl.attempts = 1) as is_flash,
      (date_trunc('month', coalesce(rl.completed_at, rl.created_at)))::date as month
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where rl.user_id = p_user_id
      and rl.completed
      and s.grading_scale in ('v', 'font', 'yds', 'french')
      and coalesce(r.declared_grade, r.community_grade) is not null
  ),
  monthly as (
    select month, discipline, grading_scale, max(grade) as best_grade
    from sent
    group by 1, 2, 3
  )
  select
    m.month,
    m.discipline,
    m.grading_scale,
    m.best_grade,
    bool_or(s.is_flash) as best_was_flash
  from monthly m
  join sent s
    on s.month = m.month
   and s.discipline = m.discipline
   and s.grading_scale = m.grading_scale
   and s.grade = m.best_grade
  group by 1, 2, 3, 4
  order by m.month, m.discipline, m.grading_scale;
$$;

-- Service-role only, like every other RPC that takes its subject as
-- an argument. The profile page has already resolved whose profile is
-- being viewed before it asks.
revoke execute on function public.get_grade_progression(uuid) from anon, authenticated, public;
grant execute on function public.get_grade_progression(uuid) to service_role;
