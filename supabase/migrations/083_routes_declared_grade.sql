-- ────────────────────────────────────────────────────────────────
-- routes.grade → routes.declared_grade
-- ────────────────────────────────────────────────────────────────
--
-- Migration 080 added `routes.grade` for Match routes, which carry
-- their own grade rather than inheriting the Set's scale. The name
-- came straight across from `jam_routes.grade`, where it was
-- unambiguous — that table had nothing else grade-shaped on it.
--
-- On `routes` it isn't. This table already carries `community_grade`
-- (the rounded average of climbers' votes, maintained by
-- `recompute_route_grade`) plus `grade_vote_count`. Next to those, a
-- bare `grade` doesn't say whether it's the input or the output of
-- grading, and the two mean opposite things: one is what the person
-- who set the route claimed, the other is what everyone who climbed
-- it decided. `declared_grade` names the half it is.
--
-- Free to do now: 080 landed the column days ago and nothing reads or
-- writes it yet — the Match UI is still on `jam_*`. The moment that
-- changes this rename stops being a one-liner.

alter table public.routes rename column grade to declared_grade;

comment on column public.routes.declared_grade is
  'What the setter/adder said this route is. Match routes set it '
  'directly; gym routes take their scale from the Set. Distinct from '
  'community_grade, which is what climbers voted — see CONTEXT.md.';
