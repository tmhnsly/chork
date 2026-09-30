-- ────────────────────────────────────────────────────────────────
-- Gym admins can run their wall
-- ────────────────────────────────────────────────────────────────
--
-- Found 2026-09-30, while making "a Set goes live" atomic: it could
-- not go live at all. `sets` has carried one policy since 001, SELECT.
-- `routes` gained INSERT and UPDATE in 080, for the players of a
-- climber-run Match only. Every gym-admin write the app makes goes
-- through the admin's own client (`requireGymAdmin` returns it), so
-- RLS refused them all:
--
--   createSet              insert into sets      42501, surfaced
--   updateSet / publish    update sets           no rows, NO ERROR
--   bulkCreateRoutes       upsert into routes    42501, surfaced
--   updateRoute            update routes         no rows, NO ERROR
--
-- Checked against production with a throwaway gym and admin. The two
-- silent ones were the worse half: Publish reported success, announced
-- "New set is now live" to every climber at the gym, and changed
-- nothing (the app stopped believing that silence in 67ba6bd). The two
-- gym Sets that exist were seeded in April, before the admin console
-- was built, which is how this went unseen. The action tests double
-- Supabase, so they never met a policy.
--
-- `is_gym_admin()` has existed since 012 for exactly this, and 014 used
-- it for every other admin table (`route_tags_map`, `gym_invites`,
-- `competition_gyms`). The two tables the console is for were missed.
--
-- ── 1. The policies ───────────────────────────────────────────────
--
-- Gym Sets only. A Match (`owner_kind = 'climber'`) is written by its
-- RPCs, never from here, and the `with check` keeps a gym Set a gym
-- Set: an admin cannot turn one into a Match or move it to a gym they
-- don't run. No DELETE: nothing in the app deletes a Set or a route,
-- and a policy nobody needs is only surface.
--
-- SELECT too. An admin is not necessarily a member: creating a gym and
-- accepting an admin invite both write `gym_admins` and no
-- `gym_memberships` row, and the existing read policies ask for
-- membership. An UPDATE has to be able to see the row it changes, so
-- without these an owner who never joined their own gym as a climber
-- would still be refused.

drop policy if exists "Gym admins read sets" on public.sets;
create policy "Gym admins read sets" on public.sets
  for select to authenticated
  using (owner_kind = 'gym' and public.is_gym_admin(gym_id));

drop policy if exists "Gym admins create sets" on public.sets;
create policy "Gym admins create sets" on public.sets
  for insert to authenticated
  with check (
    owner_kind = 'gym'
    and gym_id is not null
    and public.is_gym_admin(gym_id)
  );

drop policy if exists "Gym admins update sets" on public.sets;
create policy "Gym admins update sets" on public.sets
  for update to authenticated
  using (owner_kind = 'gym' and public.is_gym_admin(gym_id))
  with check (owner_kind = 'gym' and public.is_gym_admin(gym_id));

drop policy if exists "Gym admins read routes" on public.routes;
create policy "Gym admins read routes" on public.routes
  for select to authenticated
  using (
    exists (
      select 1 from public.sets s
      where s.id = routes.set_id
        and s.owner_kind = 'gym'
        and public.is_gym_admin(s.gym_id)
    )
  );

drop policy if exists "Gym admins add routes" on public.routes;
create policy "Gym admins add routes" on public.routes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sets s
      where s.id = routes.set_id
        and s.owner_kind = 'gym'
        and public.is_gym_admin(s.gym_id)
    )
  );

drop policy if exists "Gym admins update routes" on public.routes;
create policy "Gym admins update routes" on public.routes
  for update to authenticated
  using (
    exists (
      select 1 from public.sets s
      where s.id = routes.set_id
        and s.owner_kind = 'gym'
        and public.is_gym_admin(s.gym_id)
    )
  )
  with check (
    exists (
      select 1 from public.sets s
      where s.id = routes.set_id
        and s.owner_kind = 'gym'
        and public.is_gym_admin(s.gym_id)
    )
  );

-- ── 2. One live Set per gym, as a fact ────────────────────────────
--
-- "One live set per gym" was a convention the actions kept by
-- archiving the incumbent before publishing, in two statements. With
-- admins now able to write, it becomes a constraint: a second live Set
-- at a gym is a unique violation, whatever wrote it. Production holds
-- one gym with one live Set, so the index builds clean.

create unique index if not exists sets_one_live_per_gym
  on public.sets (gym_id)
  where status = 'live' and owner_kind = 'gym';

-- ── 3. Going live is one transaction ──────────────────────────────
--
-- The swap lived in the actions as "archive the incumbent, then write
-- the new one". createSet archived first, so a failed insert left the
-- gym with no live Set at all. Here the three rules are one step: a
-- Set needs a route to go live, the incumbent is archived, this one
-- goes live, or none of it happens.
--
-- SECURITY DEFINER with its own `is_gym_admin` check, like every other
-- RPC that owns a state change. The gym row is locked so two admins
-- publishing at once queue up rather than race the index.

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

revoke execute on function public.publish_set(uuid) from anon, public;
grant execute on function public.publish_set(uuid) to authenticated;

-- ── 4. The scheduled publish keeps the same rule ──────────────────
--
-- `auto_publish_due_sets` flipped every due draft to live and left the
-- incumbent to `auto_archive_ended_sets`, which only fires once the
-- incumbent's own end date passes. A new Set scheduled to start before
-- the old one ended made two live Sets, and `getCurrentSet` picked one
-- of them. With the index above it would instead fail the whole run.
-- So it does what publishing by hand does: at each gym the latest due
-- draft with routes goes live, and the Set it replaces is archived.
-- An earlier draft that is also due stays a draft, and a draft whose
-- own end date has already passed is never published: it used to go
-- live for one run and be archived by the next, which now would take
-- the incumbent down with it.
--
-- The body starts from supabase/definitions/auto_publish_due_sets.sql.
-- (create-or-replace preserves the existing grants.)

create or replace function public.auto_publish_due_sets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_gyms uuid[];
  v_count integer;
begin
  select array_agg(due.id), array_agg(due.gym_id)
    into v_ids, v_gyms
    from (
      select distinct on (s.gym_id) s.id, s.gym_id
        from public.sets s
       where s.owner_kind = 'gym'
         and s.status = 'draft'
         and s.starts_at <= now()
         and (s.ends_at is null or s.ends_at > now())
         and exists (select 1 from public.routes r where r.set_id = s.id)
       order by s.gym_id, s.starts_at desc
    ) due;

  if v_ids is null then
    return 0;
  end if;

  update public.sets
     set status = 'archived'
   where owner_kind = 'gym'
     and status = 'live'
     and gym_id = any(v_gyms);

  update public.sets
     set status = 'live'
   where id = any(v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
