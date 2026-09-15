-- ────────────────────────────────────────────────────────────────
-- Climbers can't delete route logs
-- ────────────────────────────────────────────────────────────────
--
-- Found mapping game deletion (2026-09-15), and confirmed against
-- production with throwaway accounts: once a game had ended, a player's
-- edit to their own log was refused, because the UPDATE policy's check
-- requires a live set (102), but deleting the log went through. The
-- DELETE policy from 012 was `user_id = auth.uid()` with no look at the
-- set, so through the Data API a climber could rewrite a finished
-- game's result, a league week's placings or an archived gym set's
-- board after the fact.
--
-- Nothing in the app deletes a log directly. A log goes only with its
-- route or its set, through cascades run inside SECURITY DEFINER RPCs or
-- by the service role, or with its climber's account
-- (`auth.admin.deleteUser`, service role). So rather than teach the
-- policy about set status, the policy and the table-level DELETE grant
-- from 066 both go: a Data API delete is refused at the privilege check
-- (42501) before any policy is consulted. Cascades are untouched. They
-- are started by the owner or the service role, and Postgres performs a
-- foreign key's cascade as the referencing table's owner in any case.
--
-- Pinned by `route-log-deletes.integration.test.ts`.

drop policy if exists "Users can delete their own route logs" on public.route_logs;

revoke delete on public.route_logs from authenticated;
