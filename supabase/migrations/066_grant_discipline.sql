-- 066: Grant discipline (audit 2026-08-10, Direction B)
--
-- Every public table currently rides the legacy Supabase auto-grant
-- (full CRUD to anon + authenticated); RLS is the only gate. This
-- migration:
--   1. Revokes anon from every table (a runtime no-op today — no policy
--      targets anon, so RLS already denies it) and declares explicit
--      authenticated grants, so a fresh `db push` after the 2026-10-30
--      Data API cutover still yields a reachable schema.
--   2. Revokes the blanket public EXECUTE on the pure trigger/cron
--      internal functions.
--
-- Uniform grant (select/insert/update/delete → authenticated) matches
-- today's effective access exactly, so there is zero functional change;
-- RLS continues to restrict every row-level operation.

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all privileges on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Internal functions never called directly by a client: trigger bodies
-- fire as the table owner, cron runs as its job role, and
-- recompute_route_grade is PERFORMed inside a definer trigger. Revoking
-- the blanket public EXECUTE closes the anon/authenticated REST exposure
-- without touching any of those execution paths.
revoke execute on function public.sync_user_set_stats() from public, anon, authenticated;
revoke execute on function public.sync_route_grade_on_log() from public, anon, authenticated;
revoke execute on function public.sync_sets_active() from public, anon, authenticated;
revoke execute on function public.seat_crew_creator() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.bump_jam_last_activity() from public, anon, authenticated;
revoke execute on function public.recompute_route_grade(uuid) from public, anon, authenticated;
revoke execute on function public.auto_publish_due_sets() from public, anon, authenticated;
