-- ────────────────────────────────────────────────────────────────
-- Retire the jam_* family
-- ────────────────────────────────────────────────────────────────
--
-- The Set convergence (080–088) moved Matches onto `sets` / `routes`
-- / `route_logs` / `set_players`. Since 088 nothing in `src/` reads a
-- `jam_*` table or calls a `jam_*` function, so this is a deletion
-- rather than a migration.
--
-- Verified before writing this, against the live database:
--
--   • jams / jam_players / jam_routes / jam_logs / jam_grades — 0 rows
--     each. `end_jam` deleted them as it collapsed each session.
--   • jam_summaries / jam_summary_players — 1 row each, the real
--     "Portland Saturday" session, already rebuilt as an archived Set
--     by migration 085 and confirmed rendering at /r/<token>.
--   • jam_summary_grades — 0 rows. Written by `end_jam`, read by
--     nothing, ever.
--   • exactly one function outside the jam_* naming reads these
--     tables (`get_user_all_time_stats`), and it has no callers.
--
-- `user_custom_scales` / `user_custom_scale_grades` are NOT dropped.
-- They were created alongside jams but are not jam-scoped — they hold
-- a climber's saved grade ladders, and `create_match` still writes
-- and `get_user_saved_scales` still reads them.

-- ── 1. The scheduler first ────────────────────────────────────────
--
-- Before dropping `end_stale_jams`, take it off the hourly schedule —
-- otherwise pg_cron keeps firing a call to a function that no longer
-- exists, and the failure only ever shows up in cron.job_run_details.
--
-- This also closes a gap: migration 084 wrote `end_stale_matches` but
-- never scheduled it, so since the UI switched over, an abandoned
-- Match would have stayed `live` forever. The sweep is what stops a
-- forgotten session sitting on someone's resume banner indefinitely.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'end_stale_jams') then
    perform cron.unschedule('end_stale_jams');
  end if;
  if exists (select 1 from cron.job where jobname = 'chork_end_stale_matches') then
    perform cron.unschedule('chork_end_stale_matches');
  end if;
end;
$$;

select cron.schedule(
  'chork_end_stale_matches',
  '0 * * * *',
  $$select public.end_stale_matches();$$
);

-- ── 2. Tables ─────────────────────────────────────────────────────
--
-- Tables go BEFORE functions, which is the opposite of the intuitive
-- order and was found by dry-running this against production: the RLS
-- policies on every jam table depend on `is_jam_player(uuid)`, so
-- dropping that function first fails with
--
--     cannot drop function is_jam_player(uuid) because other objects
--     depend on it
--
-- Dropping the tables takes their policies, triggers and indexes with
-- them, which leaves the functions genuinely unreferenced. The
-- dependency only runs one way — a function that READS a table never
-- blocks that table's drop.
--
-- Child-first, so each drop stands on its own rather than relying on
-- cascade to guess an order. `cascade` is still passed to take the
-- policies and triggers that hang off each one. It will also collect
-- any SQL-language function whose body references the table (plpgsql
-- bodies aren't tracked); the explicit drops below are written
-- `if exists` so they no-op cleanly either way.

drop table if exists public.jam_summary_grades cascade;
drop table if exists public.jam_summary_players cascade;
drop table if exists public.jam_summaries cascade;
drop table if exists public.jam_logs cascade;
drop table if exists public.jam_routes cascade;
drop table if exists public.jam_grades cascade;
drop table if exists public.jam_players cascade;
drop table if exists public.jams cascade;

-- ── 3. Functions ──────────────────────────────────────────────────
--
-- Signatures are spelled out in full: `drop function` without an
-- argument list fails on any name with more than one overload, and
-- dropping the wrong overload silently is not a risk worth leaving to
-- chance.

-- Reads `jam_summary_players`; superseded by `get_match_history` and
-- `get_match_achievement_context`. Never had a TypeScript caller.
drop function if exists public.get_user_all_time_stats(uuid);

drop function if exists public.create_jam(text, text, text, smallint, smallint, text[], text);
drop function if exists public.generate_jam_code();
drop function if exists public.join_jam_by_code(text);
drop function if exists public.add_jam_player(uuid);
drop function if exists public.leave_jam(uuid);
drop function if exists public.add_jam_route(uuid, text, smallint, boolean);
drop function if exists public.update_jam_route(uuid, text, smallint, boolean);
drop function if exists public.upsert_jam_log(uuid, integer, boolean, boolean);
drop function if exists public.get_jam_state_for_user(uuid, uuid);
drop function if exists public.get_jam_leaderboard(uuid);
drop function if exists public.get_active_jam_for_user();
drop function if exists public.get_active_jam_for_user_by_id(uuid);
drop function if exists public.get_jam_summary_for_user(uuid, uuid);
drop function if exists public.get_user_jams(uuid, integer, timestamptz);
drop function if exists public.get_jam_achievement_context(uuid);
drop function if exists public.end_jam_as_player(uuid);
drop function if exists public.end_jam(uuid);
drop function if exists public.end_stale_jams();
drop function if exists public.is_jam_player(uuid);
drop function if exists public.is_jam_host(uuid);

-- Trigger function; its triggers went with the tables above.
drop function if exists public.bump_jam_last_activity();

-- ── 4. Realtime ───────────────────────────────────────────────────
--
-- Migration 055 added the three live jam tables to the
-- `supabase_realtime` publication. Dropping a table removes it from
-- the publication automatically, so there is nothing to clean up
-- here — noted only so the absence doesn't read as an oversight.
-- `routes` / `route_logs` / `set_players` took their place in 085.
