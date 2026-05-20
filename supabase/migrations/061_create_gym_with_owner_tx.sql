-- create_gym_with_owner_tx — atomic gym + first-owner bootstrap
--
-- The previous app-side flow (src/lib/data/admin-mutations.ts:createGymWithOwner)
-- ran:
--   1. INSERT INTO gyms (...) RETURNING id
--   2. INSERT INTO gym_admins (gym_id, user_id, role='owner')
--   3. If (2) fails: DELETE FROM gyms WHERE id = new.id  (manual rollback)
--
-- The rollback is best-effort: if the DELETE itself fails (transient
-- network blip, RLS edge, lock conflict), the gym row persists with
-- NO owner. The slug is consumed and the admin can't recover via
-- signupGym without an operator manually clearing the row.
--
-- This RPC bundles both inserts into one PL/pgSQL transaction.
-- Either both commit or neither does — PostgreSQL handles the
-- rollback automatically on any exception, so the orphan-gym window
-- is gone entirely.
--
-- Auth: SECURITY DEFINER so the function bypasses the RLS write
-- block on gyms + the chicken-and-egg policy on gym_admins (which
-- requires an existing owner to authorise new admin inserts — there
-- isn't one yet on first creation). The owner_user_id is derived
-- from auth.uid() inside the function so the caller can't pass a
-- different uid than the auth one — eliminating the client-supplied
-- ownerUserId vector from the previous helper signature. The app
-- caller (signupGym) still gates via requireSignedIn + the gymSignup
-- rate-limit bucket before invoking.

create or replace function public.create_gym_with_owner_tx(
  p_name      text,
  p_slug      text,
  p_city      text,
  p_country   text,
  p_plan_tier text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_gym_id  uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Plan-tier guard mirrors the CHECK constraint added in migration
  -- 014. Catching it here lets the function surface a clean errcode
  -- rather than letting the constraint trip after the insert lands.
  if p_plan_tier not in ('starter', 'pro', 'enterprise') then
    raise exception 'Invalid plan tier' using errcode = '23514';
  end if;

  insert into public.gyms (name, slug, city, country, plan_tier, is_listed)
  values (p_name, p_slug, p_city, p_country, p_plan_tier, false)
  returning id into v_gym_id;

  insert into public.gym_admins (gym_id, user_id, role)
  values (v_gym_id, caller_id, 'owner');

  return v_gym_id;
end;
$$;

grant execute on function public.create_gym_with_owner_tx(text, text, text, text, text) to authenticated;
revoke execute on function public.create_gym_with_owner_tx(text, text, text, text, text) from anon, public;
