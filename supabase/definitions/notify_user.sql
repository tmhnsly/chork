-- public.notify_user, as it stands.
-- Generated from supabase/migrations/130_notify_user_knows_the_kinds.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
