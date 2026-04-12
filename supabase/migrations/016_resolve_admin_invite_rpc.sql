-- 016: resolve_admin_invite RPC
--
-- Returns a gym_invites row plus two SERVER-computed booleans (expired
-- and accepted). Callers previously computed `expired` by comparing
-- the returned `expires_at` against Date.now() on the server — Next.js
-- 15's react-hooks/purity rule flags Date.now() inside a Server
-- Component render, and deferring to Postgres's `now()` is the
-- correct fix regardless: no clock skew between Node and DB.
--
-- SECURITY DEFINER + search_path = '' in line with every other RPC
-- we've shipped since 008. Invoked only via the service role by the
-- invite-accept page (which needs to read rows addressed to a
-- different email than the caller's), so no authenticated grant.

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

revoke execute on function public.resolve_admin_invite(text) from anon, public;
grant  execute on function public.resolve_admin_invite(text) to service_role;
