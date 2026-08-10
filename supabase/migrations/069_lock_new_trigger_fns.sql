-- 069: lock down the trigger functions added in 067/068
--
-- guard_crew_member_update (067) and sync_comment_likes (068) are trigger
-- bodies — they fire as the table owner and are never called directly, so
-- they should not carry a REST-callable EXECUTE grant (same treatment as
-- the internal functions in migration 066). Caught by re-running the
-- Supabase security advisor after the sweep.
revoke execute on function public.guard_crew_member_update() from public, anon, authenticated;
revoke execute on function public.sync_comment_likes() from public, anon, authenticated;
