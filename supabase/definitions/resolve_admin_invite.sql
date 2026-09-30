-- public.resolve_admin_invite, as it stands.
-- Generated from supabase/migrations/016_resolve_admin_invite_rpc.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.resolve_admin_invite(p_token text)
returns table (
  id          uuid,
  gym_id      uuid,
  email       text,
  role        text,
  expires_at  timestamptz,
  accepted    boolean,
  expired     boolean
)
language sql stable security definer
set search_path = ''
as $$
  select
    gi.id,
    gi.gym_id,
    gi.email,
    gi.role,
    gi.expires_at,
    gi.accepted_at is not null        as accepted,
    gi.expires_at  < now()            as expired
  from public.gym_invites gi
  where gi.token = p_token;
$$;
