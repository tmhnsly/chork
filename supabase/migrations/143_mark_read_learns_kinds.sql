-- ────────────────────────────────────────────────────────────────
-- Mark-read learns kind scoping (written down after the fact)
-- ────────────────────────────────────────────────────────────────
--
-- Production already carries this function. It was applied from
-- `refactor/deepening`, whose own migration 136
-- (`mark_read_learns_kinds`) never reached main: the branch was
-- merged into a stack that never landed (docs/roadmap.md, "Three
-- branches that never landed"), and main's 136 is `match_setup`. So
-- the database ran a definition no migration on main described, and
-- a rebuild from this folder would have produced the old one-argument
-- function from 053.
--
-- Found 2026-09-30 by comparing every live function body in `pg_proc`
-- against the last definition the migrations give it (now
-- `pnpm db:verify`): 111 of 112 agreed, and this was the one.
--
-- Nothing changes in production. The body below is the live one,
-- verbatim, and `create or replace` of an identical function is a
-- no-op; the drop of the old signature finds nothing to drop. On a
-- fresh database it replaces 053's function, which is the point.
--
-- What it does: `p_kinds null` marks everything read, as before. A
-- list marks only those kinds, so a section that shows friend
-- requests does not read-flag a game invite nobody has seen. The
-- stamp stays `now()` inside the function: Postgres owns the read
-- timestamp, same argument as 053.
--
-- A defaulted second parameter on a new overload would leave the old
-- (uuid) signature in place and make named-argument calls ambiguous,
-- so the old function is dropped, not shadowed.

drop function if exists public.mark_all_notifications_read(uuid);

create or replace function public.mark_all_notifications_read(
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

-- Same grant stance as 053: no anon, no public. The function checks
-- auth.uid() itself, so it is only useful to a signed-in caller.
revoke execute on function public.mark_all_notifications_read(uuid, text[])
  from anon, public;
grant  execute on function public.mark_all_notifications_read(uuid, text[])
  to authenticated;
