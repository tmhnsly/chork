-- ─────────────────────────────────────────────────────────────────
-- Migration 025 — small hardening pass
--
-- Two unrelated tightenings from the audit:
--
-- 1. CHECK constraint on `route_logs.attempts` so the "attempts are
--    private and bounded" domain rule is enforced by the database,
--    not only by server-side validation. Any future code path that
--    skips validation (or a direct DB write) still can't store a
--    runaway integer.
--
-- 2. Composite index on `crew_members (user_id, status)` so the
--    hot path `getMyCrews()` — which filters by `user_id` AND
--    `status = 'active'` — can serve the query straight from the
--    index instead of filtering rows in memory.
-- ─────────────────────────────────────────────────────────────────

-- 1. route_logs.attempts bound -----------------------------------
alter table public.route_logs
  add constraint route_logs_attempts_range
  check (attempts >= 0 and attempts <= 999);

-- 2. crew_members composite index --------------------------------
create index if not exists crew_members_user_status_idx
  on public.crew_members (user_id, status);
