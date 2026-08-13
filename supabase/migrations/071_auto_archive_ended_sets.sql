-- 071: archive live sets once their end date has passed
--
-- `auto_publish_due_sets` (015, refined in 070) moves draft → live when
-- `starts_at` arrives. Nothing ever moved live → archived, so a set
-- stayed `live` indefinitely past its `ends_at`. Yonder's had been live
-- for 99 days after ending when this was found.
--
-- That split the app's idea of "current" in two:
--
--   • Climber-facing surfaces derive their label from the dates, so the
--     Chorkboard read "SET ENDED".
--   • `getCurrentSet` filters on `status = 'live'` alone, so the same
--     set was still served as the Wall's current set.
--   • Migration 003 gates `route_logs` inserts on the set being live,
--     so climbers could still log sends against it.
--
-- An admin looking at /admin saw "LIVE" while a climber saw "SET
-- ENDED", and both were reading the same row.
--
-- Archiving on time makes `getCurrentSet` return null, which every
-- consumer already handles deliberately: the Wall shows CreateSetForm
-- to admins and "No active set right now" to climbers, the leaderboard
-- falls back to its all-time tab with an empty route list, and
-- ProfileStats drops its current-set card. The gap was never the
-- null path — it was that a set could never reach it.
--
-- Deliberately NOT auto-creating a replacement. A gym with no live set
-- is a real state (between sets, or a gym that has stopped setting),
-- and inventing an empty set to paper over it would put a Wall full of
-- nothing in front of climbers instead of an honest empty state.
create or replace function public.auto_archive_ended_sets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sets
     set status = 'archived'
   where status = 'live'
     and ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.auto_archive_ended_sets() to postgres;

-- Same cadence and duplicate-guard as `chork_auto_publish_due_sets`.
-- Five minutes is well inside the tolerance here: `ends_at` is a date
-- boundary a climber picked weeks earlier, not a precise deadline.
do $$
declare
  v_existing bigint;
begin
  select jobid into v_existing
    from cron.job
   where jobname = 'chork_auto_archive_ended_sets';
  if v_existing is not null then
    perform cron.unschedule(v_existing);
  end if;

  perform cron.schedule(
    'chork_auto_archive_ended_sets',
    '*/5 * * * *',
    $cmd$select public.auto_archive_ended_sets();$cmd$
  );
end $$;
