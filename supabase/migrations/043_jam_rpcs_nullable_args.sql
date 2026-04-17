-- Re-declares the jam RPCs from migration 041 with `default null` on
-- every argument that's conceptually optional. Pure signature tweak
-- — the function bodies are unchanged.
--
-- Why this matters: `supabase gen types typescript` generates
-- non-nullable TS types for RPC args that don't have a `DEFAULT`
-- clause, even when the function body handles null via `nullif` /
-- coalesce. Adding explicit defaults makes the generated types
-- match what the app actually passes, which kills a round of
-- `null` → empty-string coercion at every call site.

-- ── create_jam ────────────────────────────────────

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

  if p_grading_scale is null or p_grading_scale not in ('v', 'font', 'custom') then
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

-- ── add_jam_route ─────────────────────────────────

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
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_jam_player(p_jam_id) then
    raise exception 'Not a player in this jam' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.jams
    where id = p_jam_id and status = 'live'
  ) then
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
    p_grade,
    coalesce(p_has_zone, false),
    caller_id
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.add_jam_route(uuid, text, smallint, boolean) to authenticated;
revoke execute on function public.add_jam_route(uuid, text, smallint, boolean) from anon, public;

-- ── update_jam_route ──────────────────────────────

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

  if not exists (
    select 1 from public.jams
    where id = target.jam_id and status = 'live'
  ) then
    raise exception 'Jam is not live' using errcode = 'P0001';
  end if;

  update public.jam_routes
     set description = nullif(trim(coalesce(p_description, '')), ''),
         grade = p_grade,
         has_zone = coalesce(p_has_zone, has_zone)
   where id = p_route_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.update_jam_route(uuid, text, smallint, boolean) to authenticated;
revoke execute on function public.update_jam_route(uuid, text, smallint, boolean) from anon, public;

-- ── upsert_jam_log ────────────────────────────────

drop function if exists public.upsert_jam_log(
  uuid, integer, boolean, boolean
);

create or replace function public.upsert_jam_log(
  p_jam_route_id uuid,
  p_attempts integer default 0,
  p_completed boolean default false,
  p_zone boolean default false
)
returns public.jam_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  route_row public.jam_routes;
  result public.jam_logs;
  new_completed_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into route_row from public.jam_routes where id = p_jam_route_id;
  if route_row.id is null then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;

  if not public.is_jam_player(route_row.jam_id) then
    raise exception 'Not a player in this jam' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.jams
    where id = route_row.jam_id and status = 'live'
  ) then
    raise exception 'Jam is not live' using errcode = 'P0001';
  end if;

  if p_completed then
    new_completed_at := now();
  else
    new_completed_at := null;
  end if;

  insert into public.jam_logs (
    jam_id, jam_route_id, user_id, attempts, completed, completed_at, zone
  ) values (
    route_row.jam_id,
    p_jam_route_id,
    caller_id,
    coalesce(p_attempts, 0),
    coalesce(p_completed, false),
    new_completed_at,
    coalesce(p_zone, false)
  )
  on conflict (user_id, jam_route_id) do update
    set attempts = excluded.attempts,
        completed = excluded.completed,
        completed_at = case
          when excluded.completed and not public.jam_logs.completed then now()
          when not excluded.completed then null
          else public.jam_logs.completed_at
        end,
        zone = excluded.zone,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.upsert_jam_log(uuid, integer, boolean, boolean) to authenticated;
revoke execute on function public.upsert_jam_log(uuid, integer, boolean, boolean) from anon, public;
