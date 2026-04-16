-- 040: lock notify_user down to service role
--
-- Previously `notify_user` was granted to `authenticated`, meaning any
-- signed-in user could call the RPC with an arbitrary `p_user_id` and
-- `p_payload` — a spoofing / spam surface (e.g. "fake crew invite from
-- @some_admin"). The RPC is SECURITY DEFINER so it bypasses the
-- notifications table's insert-blocking RLS and writes the row.
--
-- App-side flows always call notify_user from server code anyway, so
-- the fix is to restrict execution to the service role. The notifyUser
-- helper in src/lib/notify.ts now uses createServiceClient() internally.
--
-- Supabase's service_role bypasses grants via the PostgREST bypass list,
-- but we add an explicit grant too so the intent is documented in SQL.

revoke execute on function public.notify_user(uuid, text, jsonb) from authenticated;
grant  execute on function public.notify_user(uuid, text, jsonb) to service_role;
