-- Correct the parameter shape of create_gym_with_owner_tx so the
-- Supabase TS type generator marks the nullable args (city, country)
-- as optional instead of forcing callers to `as unknown as string`
-- around legitimately-null values.
--
-- Migration 061 shipped with positional args (p_name, p_slug, p_city,
-- p_country, p_plan_tier). Postgres rule: once a parameter has a
-- DEFAULT, every parameter after it must also have one. So either:
--   a) every trailing param gets a default (would force a default on
--      p_plan_tier — undesirable, callers should always pick a tier),
--   b) reorder so nullable-with-defaults params are last.
--
-- We pick (b). Postgres identifies functions by (name, arg types),
-- not arg names, so reorder requires a DROP + CREATE rather than a
-- CREATE OR REPLACE. There are no callers in production besides
-- signupGym, which goes through the typed admin-mutations helper —
-- updating that helper alongside this migration keeps wire and code
-- in lockstep.

drop function if exists public.create_gym_with_owner_tx(text, text, text, text, text);

create or replace function public.create_gym_with_owner_tx(
  p_name      text,
  p_slug      text,
  p_plan_tier text,
  p_city      text default null,
  p_country   text default null
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
