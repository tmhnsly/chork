-- Adds a `points` grading scale to Jams so hosts can start a jam
-- where every route is ungraded and the leaderboard ranks purely by
-- the same points-from-attempts formula already used elsewhere
-- (flash=4, 2-try=3, 3-try=2, 4+=1, + 1 if zone).
--
-- Mirrors the gym-side `sets.grading_scale = 'points'` mode —
-- `grade-label.ts` already treats `points` as grade-less, so the
-- front-end just needs to skip the grade picker for points jams.
--
-- No data migration needed: existing rows remain on the original
-- three scales. The extended constraint simply widens the set of
-- accepted values.

-- ── Extend the constraint on the two tables that carry grading_scale

alter table public.jams
  drop constraint if exists jams_grading_scale_check;
alter table public.jams
  add constraint jams_grading_scale_check
    check (grading_scale in ('v', 'font', 'custom', 'points'));

alter table public.jam_summaries
  drop constraint if exists jam_summaries_grading_scale_check;
alter table public.jam_summaries
  add constraint jam_summaries_grading_scale_check
    check (grading_scale in ('v', 'font', 'custom', 'points'));

-- ── Replace create_jam with a version that accepts 'points' ────

drop function if exists public.create_jam(
  text, text, text, smallint, smallint, text[], text
);

create or replace function public.create_jam(
  p_name text default null,
  p_location text default null,
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null
)
returns table (
  id uuid,
  code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_jam_id uuid;
  new_code text;
  new_scale_id uuid;
  grade_label text;
  grade_ordinal smallint;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_grading_scale is null
     or p_grading_scale not in ('v', 'font', 'custom', 'points') then
    raise exception 'Invalid grading scale' using errcode = '22023';
  end if;

  if p_grading_scale = 'custom' then
    if p_custom_grades is null or array_length(p_custom_grades, 1) is null then
      raise exception 'Custom grading scale requires at least one grade' using errcode = '22023';
    end if;
    if array_length(p_custom_grades, 1) > 50 then
      raise exception 'Custom grading scale capped at 50 grades' using errcode = '22023';
    end if;
  end if;

  new_code := public.generate_jam_code();

  insert into public.jams (
    code, name, location, host_id, grading_scale,
    min_grade, max_grade, status
  ) values (
    new_code,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_location, '')), ''),
    caller_id,
    p_grading_scale,
    case when p_grading_scale in ('v', 'font') then p_min_grade else null end,
    case when p_grading_scale in ('v', 'font') then p_max_grade else null end,
    'live'
  )
  returning public.jams.id into new_jam_id;

  insert into public.jam_players (jam_id, user_id)
  values (new_jam_id, caller_id);

  if p_grading_scale = 'custom' then
    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.jam_grades (jam_id, ordinal, label)
      values (new_jam_id, grade_ordinal, trim(grade_label));
      grade_ordinal := grade_ordinal + 1;
    end loop;
  end if;

  if p_save_scale_name is not null
     and char_length(trim(p_save_scale_name)) > 0
     and p_grading_scale = 'custom' then
    insert into public.user_custom_scales (user_id, name)
    values (caller_id, trim(p_save_scale_name))
    returning public.user_custom_scales.id into new_scale_id;

    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.user_custom_scale_grades (scale_id, ordinal, label)
      values (new_scale_id, grade_ordinal, trim(grade_label));
      grade_ordinal := grade_ordinal + 1;
    end loop;
  end if;

  return query select new_jam_id, new_code;
end;
$$;

grant execute on function public.create_jam(
  text, text, text, smallint, smallint, text[], text
) to authenticated;
revoke execute on function public.create_jam(
  text, text, text, smallint, smallint, text[], text
) from anon, public;

-- ── Defensive: if a points-mode route is added with a grade, null it.
-- Cheap guard so a buggy client can't store grades a points-mode jam
-- promises to hide. The server is the source of truth.

drop function if exists public.add_jam_route(
  uuid, text, smallint, boolean
);

create or replace function public.add_jam_route(
  p_jam_id uuid,
  p_description text default null,
  p_grade smallint default null,
  p_has_zone boolean default false
)
returns public.jam_routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_number integer;
  result public.jam_routes;
  jam_scale text;
  jam_status text;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_jam_player(p_jam_id) then
    raise exception 'Not a player in this jam' using errcode = '42501';
  end if;

  -- Serialise concurrent inserts for the jam so the `number` sequence
  -- can't collide (matches the lock added in migration 044). The
  -- `for update` lock also lets us read `grading_scale` + `status`
  -- in the same query once the row is pinned.
  select grading_scale, status
    into jam_scale, jam_status
  from public.jams
  where id = p_jam_id
  for update;

  if jam_scale is null then
    raise exception 'Jam not found' using errcode = 'P0002';
  end if;
  if jam_status <> 'live' then
    raise exception 'Jam is not live' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into next_number
  from public.jam_routes
  where jam_id = p_jam_id;

  insert into public.jam_routes (
    jam_id, number, description, grade, has_zone, added_by
  ) values (
    p_jam_id,
    next_number,
    nullif(trim(coalesce(p_description, '')), ''),
    case when jam_scale = 'points' then null else p_grade end,
    coalesce(p_has_zone, false),
    caller_id
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.add_jam_route(uuid, text, smallint, boolean) to authenticated;
revoke execute on function public.add_jam_route(uuid, text, smallint, boolean) from anon, public;

-- Same guard on update_jam_route — can't let a later edit backdoor a
-- grade onto a points-mode jam.

drop function if exists public.update_jam_route(
  uuid, text, smallint, boolean
);

create or replace function public.update_jam_route(
  p_route_id uuid,
  p_description text default null,
  p_grade smallint default null,
  p_has_zone boolean default null
)
returns public.jam_routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.jam_routes;
  result public.jam_routes;
  jam_scale text;
  jam_status text;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into target from public.jam_routes where id = p_route_id;
  if target.id is null then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;

  if not public.is_jam_player(target.jam_id) then
    raise exception 'Not a player in this jam' using errcode = '42501';
  end if;

  -- Lock the jam row so end_jam can't flip status between the
  -- scale read and the update; matches add_jam_route's pattern so
  -- points-mode guarantees hold end-to-end.
  select grading_scale, status
    into jam_scale, jam_status
  from public.jams
  where id = target.jam_id
  for update;

  if jam_status <> 'live' then
    raise exception 'Jam is not live' using errcode = 'P0001';
  end if;

  update public.jam_routes
     set description = nullif(trim(coalesce(p_description, '')), ''),
         grade = case when jam_scale = 'points' then null else p_grade end,
         has_zone = coalesce(p_has_zone, has_zone)
   where id = p_route_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.update_jam_route(uuid, text, smallint, boolean) to authenticated;
revoke execute on function public.update_jam_route(uuid, text, smallint, boolean) from anon, public;
