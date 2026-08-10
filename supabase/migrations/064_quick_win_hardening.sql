-- 064: Quick-win hardening (audit 2026-08-10)
--
-- Small, low-risk, non-breaking fixes surfaced by the full audit:
--   1. Fix the live jam_summary_players deletion bomb.
--   2. Pin compute_points' search_path (Supabase advisor 0011).
--   3. Drop the dangling is_blocking() over the removed blocked_users.
--   4. Add three missing FK indexes (Supabase advisor 0001).

-- ── 1. jam_summary_players deletion bomb ──────────────────────────
-- Migration 044 switched this table to a surrogate `id` PK + a partial
-- unique index on (jam_summary_id, user_id) WHERE user_id IS NOT NULL,
-- intending to let user_id's `ON DELETE SET NULL` FK anonymise the row
-- on account deletion. But dropping the composite PK does NOT clear the
-- columns' NOT NULL flag, so user_id stayed NOT NULL and the SET NULL
-- still throws 23502 — reproduced live during an account wipe. Relaxing
-- NOT NULL is all that was missing; the partial unique index already
-- excludes null user_ids, so anonymised rows coexist fine.
alter table public.jam_summary_players
  alter column user_id drop not null;

-- ── 2. compute_points search_path ─────────────────────────────────
-- The scoring-ladder helper (migration 063) is the only function the
-- security advisor flags with a mutable search_path. It's SECURITY
-- INVOKER and pure (arithmetic/CASE on built-ins only), so pinning to
-- empty changes no behaviour and matches the codebase standard.
alter function public.compute_points(integer, boolean, boolean)
  set search_path = '';

-- ── 3. Dead is_blocking() ─────────────────────────────────────────
-- References public.blocked_users, dropped in migration 024. Never
-- called from app code or any policy; would throw "relation does not
-- exist" if ever wired in. Remove the landmine.
drop function if exists public.is_blocking(uuid, uuid);

-- ── 4. Missing FK indexes (Supabase lint 0001) ────────────────────
-- Unindexed foreign keys → cascade/lookup sequential scans.
-- (route_logs.gym_id was deliberately dropped in migration 058 — 0
-- scans, and gym deletion is NO ACTION-blocked anyway; revisited when
-- gym-deletion semantics are decided in the DB-integrity pass.)
create index if not exists crew_members_invited_by_idx
  on public.crew_members (invited_by);
create index if not exists jam_routes_added_by_idx
  on public.jam_routes (added_by);
create index if not exists user_set_stats_set_id_idx
  on public.user_set_stats (set_id);
