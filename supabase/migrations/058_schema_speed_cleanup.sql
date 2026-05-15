-- Schema speed cleanup — verified against live index/scan stats
-- (`supabase inspect db index-stats --linked`) so each change is
-- backed by actual usage data, not aspirational guesses.
--
-- Most of the audit's "missing composite index" candidates turned out
-- to already exist via the corresponding unique constraints
-- (e.g. `gym_memberships_user_id_gym_id_key` has 70,963 scans —
-- the audit thought it was missing because it was looking for the
-- explicit `_idx` suffix). The schema is already well-indexed for
-- the current query mix.
--
-- This migration cleans up the genuinely unused / broken pieces:
--   1. `get_jam_state` — broken function (linter flags hard error),
--      no callers in src/.
--   2. `notifications_created_at_idx` — no user-id prefix, planner
--      can't use it for any current query. 0 scans confirmed.
--   3. `route_logs_gym` — single-column on gym_id only; every actual
--      query against route_logs filters by user_id (via the much-
--      hotter `route_logs_user_idx` with 3,126 scans). 0 scans
--      confirmed.
--   4. `sets_status_idx` — superseded by a tighter partial index
--      that matches the actual query shape
--      (`WHERE status = 'live'`). Same pattern migration 041 used
--      for `jams_status_live_idx`.
--
-- All four operations are no-ops if the targets are already missing.
-- Safe to re-apply.

-- ── 1. Drop broken function ──────────────────────────
-- Migration 041 defined `get_jam_state(uuid)` using `row_to_jsonb`
-- which is not a real Postgres function (it's `to_jsonb`). The
-- function compiles but errors at first call. Migration 048
-- introduced `get_jam_state_for_user(uuid, uuid)` as the working
-- replacement, but the broken one was never dropped.

drop function if exists public.get_jam_state(uuid);

-- ── 2. Drop notifications_created_at_idx ─────────────
-- Migration 033 added this as a global index on `created_at desc`
-- with no user-id prefix. Every notification read in the app
-- filters by user_id first, so the planner has nothing to do with
-- a pure-time index. Adds write overhead on every notification
-- insert for zero read benefit.

drop index if exists public.notifications_created_at_idx;

-- ── 3. Drop route_logs_gym ────────────────────────────
-- Migration 002 added a single-column index on gym_id. Every live
-- query against route_logs filters by user_id (or user_id + route_id)
-- — `route_logs_user_idx` (3,126 scans) and
-- `route_logs_user_id_route_id_key` (1,466 scans) carry the load.
-- Gym-scoped reads against route_logs route through cached helpers
-- on the sets level, not direct table scans.

drop index if exists public.route_logs_gym;

-- ── 4. Replace sets_status_idx with a partial index ──
-- The old index `(gym_id, status)` (migration 014) is the inverse of
-- what the hot query needs. App code asks `WHERE status = 'live'`
-- (sometimes with gym_id, sometimes without — `getAllLiveSets` is
-- the without-gym path). A partial index keyed on status='live' is
-- a fraction of the size and lets the planner pick it for both
-- variants. Mirrors `jams_status_live_idx` from migration 041.

drop index if exists public.sets_status_idx;

create index if not exists sets_status_live_idx
  on public.sets (gym_id)
  where status = 'live';
