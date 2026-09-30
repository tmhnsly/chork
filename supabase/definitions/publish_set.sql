-- public.publish_set, as it stands.
-- Generated from supabase/migrations/145_gym_admins_can_run_their_wall.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.publish_set(p_set_id uuid)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sets;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into target from public.sets where id = p_set_id;

  -- A missing Set, a Match, and a gym the caller doesn't run all read
  -- the same, so a guessed id learns nothing.
  if target.id is null
     or target.owner_kind <> 'gym'
     or not public.is_gym_admin(target.gym_id) then
    raise exception 'Set not found' using errcode = '42501';
  end if;

  perform 1 from public.gyms where id = target.gym_id for update;

  -- Read again under the lock: another admin may have published or
  -- archived it while this call waited.
  select * into target from public.sets where id = p_set_id;
  if target.status = 'live' then
    return target;
  end if;

  if not exists (select 1 from public.routes r where r.set_id = p_set_id) then
    raise exception 'Add at least one route before publishing this set.'
      using errcode = '22023';
  end if;

  update public.sets
     set status = 'archived'
   where gym_id = target.gym_id
     and owner_kind = 'gym'
     and status = 'live'
     and id <> p_set_id;

  update public.sets
     set status = 'live'
   where id = p_set_id
  returning * into target;

  return target;
end;
$$;
