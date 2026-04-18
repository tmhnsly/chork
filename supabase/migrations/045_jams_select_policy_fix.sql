-- Fix: the tightened `jams_select` policy from migration 044 was
-- blocking legitimate access for both hosts and players. Creating a
-- jam would succeed (via the SECURITY DEFINER `create_jam` RPC),
-- but the next direct SELECT on `jams` returned zero rows — so the
-- `/jam/[id]` server page saw no jam and redirected to `/jam/join`.
-- ActiveJamBanner worked because it went through the SECURITY
-- DEFINER `get_active_jam_for_user` RPC, which bypasses RLS.
--
-- Root cause: wrapping the membership check in `is_jam_player(id)`
-- (a SECURITY DEFINER helper) inside the RLS `USING` clause failed
-- to evaluate correctly for the calling role in some edge cases.
-- Inlining the membership EXISTS directly — same shape as the
-- `crew_members` + `gym_memberships` policies elsewhere in the
-- schema — fixes it.
--
-- Security posture unchanged: still restricted to host + active
-- players; non-players fall back to the SECURITY DEFINER
-- `join_jam_by_code` RPC for the pre-join confirm flow.

drop policy if exists jams_select on public.jams;

create policy jams_select on public.jams
  for select to authenticated
  using (
    host_id = (select auth.uid())
    or exists (
      select 1
      from public.jam_players jp
      where jp.jam_id = jams.id
        and jp.user_id = (select auth.uid())
        and jp.left_at is null
    )
  );
