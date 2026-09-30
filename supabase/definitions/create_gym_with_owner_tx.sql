-- public.create_gym_with_owner_tx, as it stands.
-- Generated from supabase/migrations/062_create_gym_with_owner_tx_nullable_args.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
