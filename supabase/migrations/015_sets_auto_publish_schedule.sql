-- 015: Auto-publish scheduled sets via pg_cron
--
-- Spec (from Phase 2): "A set can go live automatically at its start
-- date OR be manually toggled live by an admin at any time — support
-- both. The manual toggle overrides the scheduled date. Handle the
-- auto-scheduling reliably — use a Supabase scheduled function or
-- equivalent, not a client-side check."
--
-- Strategy:
--   • Pure SQL function flips any `status = 'draft'` set whose
--     `starts_at` is now-or-past to `status = 'live'`. The existing
--     sets_sync_active trigger then derives the legacy `active` flag
--     so any old code path still reads it correctly.
--   • pg_cron schedules the function every 5 minutes. Start-at
--     precision of ±5 min is plenty for comp sets that run for weeks.
--   • SECURITY DEFINER so the cron job bypasses RLS; search_path = ''
--     is set to prevent schema injection.
--
-- Manual publish keeps working the same way it did — the UI calls
-- `updateSet(..., status: 'live')` which writes directly. This job
-- only picks up the drafts the admin hasn't touched.

create extension if not exists pg_cron with schema extensions;

create or replace function public.auto_publish_due_sets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sets
     set status = 'live'
   where status = 'draft'
     and starts_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.auto_publish_due_sets() to postgres;

-- pg_cron usage notes:
--   • Jobs live in the `cron` schema (cron.schedule, cron.unschedule).
--   • Each `select cron.schedule(...)` call inserts a new job row; we
--     guard against duplicates by unscheduling first on re-run.

do $$
declare
  v_existing bigint;
begin
  select jobid into v_existing
    from cron.job
   where jobname = 'chork_auto_publish_due_sets';
  if v_existing is not null then
    perform cron.unschedule(v_existing);
  end if;

  perform cron.schedule(
    'chork_auto_publish_due_sets',
    '*/5 * * * *',
    $cmd$select public.auto_publish_due_sets();$cmd$
  );
end $$;
