-- Server-authoritative `read_at` stamp for the mark-all-read flow.
-- Prior to this, the client supplied `new Date().toISOString()` which
-- leaned on Node's wall clock. Vercel's fleet is NTP-synced tightly
-- in practice, but "trust the caller's clock" is the wrong default
-- for an audit/logging column — if a function instance ever drifted
-- we'd silently stamp notifications into the wrong ordering relative
-- to their `created_at` (which is already Postgres-stamped). One
-- RPC + `now()` closes the gap at zero app-code cost.
--
-- Returns the number of rows flipped so the caller can bust cache
-- tags conditionally if we ever want that; today they always bust.
--
-- RLS is bypassed by the `security definer` here because we only
-- ever update `read_at` and only for `p_user_id = auth.uid()` — any
-- other shape would be a policy violation elsewhere in the stack
-- (the fn itself enforces the self-only scope).

create or replace function public.mark_all_notifications_read(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then
    return 0;
  end if;

  update public.notifications
     set read_at = now()
   where user_id = p_user_id
     and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Signed-in users only — anon can't even see their notifications,
-- let alone mark them. service_role is deliberately NOT granted;
-- the fn validates `auth.uid()` internally so it only makes sense
-- as an authenticated call.
revoke execute on function public.mark_all_notifications_read(uuid)
  from anon, public;
grant  execute on function public.mark_all_notifications_read(uuid)
  to authenticated;
