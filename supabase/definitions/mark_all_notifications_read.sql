-- public.mark_all_notifications_read, as it stands.
-- Generated from supabase/migrations/143_mark_read_learns_kinds.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
