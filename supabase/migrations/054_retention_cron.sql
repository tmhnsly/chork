-- 054: Data-retention cron jobs for the two unbounded-growth tables.
--
-- Both `notifications` and `activity_events` accumulate one row per
-- user interaction with no current retention policy. At meaningful
-- scale (100k users × 1 event/day × 365 days ≈ 36M rows) the
-- table-scan cost of any full-table query starts to matter. This
-- migration bounds both.
--
-- Design:
--   • notifications — 90-day TTL. In-app feed only surfaces recent
--     rows; anything older is noise the user has already scrolled
--     past. Partial index `notifications_user_unread_idx`
--     (migration 033) keeps the unread query path fast regardless
--     of how large the archived-read set grows, but storage still
--     climbs forever without this prune.
--   • activity_events — 365-day TTL. The crew activity feed already
--     coarse-stamps anything over a month as "over a month ago" via
--     `relativeDay()` (src/lib/data/crew-time.ts), so anything
--     older than a year is product-invisible anyway.
--
-- Both jobs are batched at LIMIT 10000 per run so a backlog after
-- downtime doesn't turn into a single multi-minute statement holding
-- a write lock on the table. If 10k/day isn't enough to keep up
-- (shouldn't happen at any realistic scale), the next day's run
-- picks up the rest.
--
-- SECURITY DEFINER + `set search_path = ''` so the cron job bypasses
-- RLS and schema injection is impossible via `public` shadowing.
-- Granted only to `postgres` (pg_cron runs as the table owner).

create extension if not exists pg_cron with schema extensions;

-- ── prune_old_notifications ────────────────────────
create or replace function public.prune_old_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.notifications
   where id in (
     select id from public.notifications
      where created_at < now() - interval '90 days'
      limit 10000
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.prune_old_notifications() to postgres;
revoke execute on function public.prune_old_notifications() from anon, authenticated, public;

-- ── prune_old_activity_events ──────────────────────
create or replace function public.prune_old_activity_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.activity_events
   where id in (
     select id from public.activity_events
      where created_at < now() - interval '365 days'
      limit 10000
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.prune_old_activity_events() to postgres;
revoke execute on function public.prune_old_activity_events() from anon, authenticated, public;

-- ── Schedule (idempotent — matches the migration 015 pattern) ──
do $$
declare
  v_existing bigint;
begin
  -- notifications job
  select jobid into v_existing
    from cron.job
   where jobname = 'chork_prune_notifications';
  if v_existing is not null then
    perform cron.unschedule(v_existing);
  end if;
  perform cron.schedule(
    'chork_prune_notifications',
    '0 2 * * *',
    $cmd$select public.prune_old_notifications();$cmd$
  );

  -- activity_events job
  select jobid into v_existing
    from cron.job
   where jobname = 'chork_prune_activity_events';
  if v_existing is not null then
    perform cron.unschedule(v_existing);
  end if;
  perform cron.schedule(
    'chork_prune_activity_events',
    '0 2 * * *',
    $cmd$select public.prune_old_activity_events();$cmd$
  );
end $$;
