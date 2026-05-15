-- Speed up the `auto_publish_due_sets()` cron from migration 015.
--
-- pg_stat_statements (audited 2026-05) showed the cron averaging
-- ~6ms per call across 9,558 invocations — that's the #2 query by
-- total execution time (44.7% of measured app-execution time, after
-- the Realtime WAL stream). The query body is:
--
--   update public.sets set status = 'live'
--   where status = 'draft' and starts_at <= now();
--
-- With no covering index for `(status = 'draft', starts_at)`, every
-- 5-minute cron fire seq-scans `sets`. Most runs find zero drafts —
-- pure waste. A partial index keyed on `starts_at WHERE status =
-- 'draft'` collapses the search to a sub-millisecond range scan.
-- The index is tiny because drafts are temporary (they flip to
-- 'live' or 'archived' once published / abandoned).
--
-- Migration 058 dropped the old `sets_status_idx` (which was on
-- `(gym_id, status)` — wrong shape for this query anyway). The new
-- `sets_status_live_idx` is partial WHERE status='live' — doesn't
-- help find drafts. This adds the missing piece.

create index if not exists sets_pending_publish_idx
  on public.sets (starts_at)
  where status = 'draft';
