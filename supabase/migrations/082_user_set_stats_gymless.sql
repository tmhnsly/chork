-- ────────────────────────────────────────────────────────────────
-- The materialised set stats have to survive a gymless Set
-- ────────────────────────────────────────────────────────────────
--
-- `sync_user_set_stats()` is an AFTER trigger on `route_logs`. It
-- reads the log's set, takes `sets.gym_id` from it, and upserts the
-- recomputed aggregate into `user_set_stats`.
--
-- Migration 080 made `sets.gym_id` nullable so a climber-run Match
-- can live in the same table. That quietly armed a landmine one layer
-- down: the FIRST Match log would resolve `v_gym_id` to null, hit the
-- NOT NULL on `user_set_stats.gym_id`, and abort — taking the whole
-- `route_logs` insert with it, because the trigger runs inside the
-- writer's transaction. Not "stats go stale": the send doesn't land.
--
-- Nothing is broken today only because nothing writes Match logs yet
-- — the app still reads `jam_*`. This lands before that changes.
--
-- Nullable is the right shape rather than a sentinel gym: the column
-- exists so gym-scoped readers can filter cheaply, and a Match has
-- genuinely no gym to filter on. `get_user_set_stats(p_user_id,
-- p_gym_id)` filters on equality, so null rows simply never match a
-- gym's query — which is correct, a Match is not part of anyone's
-- gym stats. The cached leaderboard is unaffected for the same
-- reason: it selects by `set_id` and verifies the set→gym pairing
-- separately.
--
-- The two indexes that lead with `gym_id` need no change: btree
-- stores nulls, so Match rows sit in the null bucket and an
-- equality-filtered gym query never visits them.

alter table public.user_set_stats alter column gym_id drop not null;

comment on column public.user_set_stats.gym_id is
  'Null for a Match (owner_kind = climber), which has no gym. '
  'Denormalised from sets.gym_id by sync_user_set_stats() so '
  'gym-scoped readers can filter without a join.';
