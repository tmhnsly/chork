-- ────────────────────────────────────────────────────────────────
-- Friend-request notifications have been failing since migration 108
-- ────────────────────────────────────────────────────────────────
--
-- Found while testing the match invite: the toast said "Invited" and
-- no notification row existed. `notify_user` — the SECURITY DEFINER
-- RPC every in-app notification goes through (migration 040) — has
-- its OWN allow-list of kinds, separate from the table's check
-- constraint, and it still read the three CREW kinds:
--
--   crew_invite_received, crew_invite_accepted, crew_ownership_transferred
--
-- 108 removed crews and renamed the constraint's kinds to
-- friend_request_*; 129 added match_invite_received to the
-- constraint. Neither touched this function, so every call since 108
-- has raised "unknown notification kind" — friend requests included.
-- `notify()` catches that and logs a warn, which is why nothing
-- crashed and nothing was noticed: the dev log has
-- "notify_log_failed ... unknown notification kind:
-- friend_request_received" from three days ago.
--
-- Push notifications were unaffected (they go straight to web-push),
-- which is the other reason it hid: a climber with push on still got
-- told; the in-app list under the bell was silently empty.
--
-- ── Two allow-lists was the bug ─────────────────────────────────
--
-- The fix is not to update the function's list. It is to DELETE it,
-- and let the table's check constraint be the single place a kind is
-- allowed — a bad kind still raises, as 23514 instead of P0001, and
-- there is no longer a second list to forget. `notification-kinds.
-- test.ts` pins the TS union to the constraint; it could never have
-- pinned this function, and it did not.

create or replace function public.notify_user(
  p_user_id uuid,
  p_kind text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;

  -- The check constraint on `notifications.kind` is the one gate.
  -- An unknown kind raises 23514 from the insert below.
  insert into public.notifications (user_id, kind, payload)
    values (p_user_id, p_kind, coalesce(p_payload, '{}'::jsonb))
    returning id into new_id;

  return new_id;
end;
$$;

-- Grants unchanged: service-role only, per migration 040.
revoke execute on function public.notify_user(uuid, text, jsonb) from anon, authenticated, public;
grant execute on function public.notify_user(uuid, text, jsonb) to service_role;
