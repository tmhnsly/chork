-- ────────────────────────────────────────────────────────────────
-- Mark-read learns kind scoping
-- ────────────────────────────────────────────────────────────────
--
-- The notification inbox is no longer one global sheet — rows
-- surface in the section that owns their kind (friend kinds on
-- /friends, match kinds on /match). Each section marks read only
-- what it showed, so visiting /friends must not read-flag a match
-- invite you haven't seen.
--
-- `p_kinds null` keeps the old everything behaviour. The stamp
-- stays `now()` inside the function — Postgres owns the canonical
-- read timestamp, same argument as 053.
--
-- A defaulted second parameter on a NEW overload would leave the
-- old (uuid) signature in place and make named-arg calls ambiguous,
-- so the old function is dropped, not shadowed. Forward-only, per
-- docs/migrations.md.

drop function if exists public.mark_all_notifications_read(uuid);

create function public.mark_all_notifications_read(
  p_user_id uuid,
  p_kinds text[] default null
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
     and read_at is null
     and (p_kinds is null or kind = any(p_kinds));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Same grant stance as 053: authenticated only; the fn validates
-- auth.uid() internally, service_role deliberately not granted.
revoke execute on function public.mark_all_notifications_read(uuid, text[])
  from anon, public;
grant  execute on function public.mark_all_notifications_read(uuid, text[])
  to authenticated;
