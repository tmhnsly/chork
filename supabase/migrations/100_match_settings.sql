-- ────────────────────────────────────────────────────────────────
-- A host can configure their own Match
-- ────────────────────────────────────────────────────────────────
--
-- Found while wiring the handicap: `sets` has exactly one policy, a
-- SELECT. A climber who created a Match could not change anything
-- about it — turning the handicap on silently updated zero rows.
--
-- The fix is NOT an UPDATE policy on `sets`. That table holds
-- `owner_kind`, `gym_id`, `status` and `share_token`, so a policy
-- broad enough to let a host flip `handicap` would also let them
-- convert their Match into a gym Set, archive it, or mint themselves
-- a share token. These are narrow definer functions instead — each
-- one changes exactly the column it names.

-- ── 1. Handicap on/off ────────────────────────────────────────────
--
-- Allowed while the Match is live rather than only at creation: the
-- reason to want a handicap usually turns up after the first climber
-- of a very different grade arrives.

create or replace function public.set_match_handicap(
  p_set_id uuid,
  p_enabled boolean
)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.sets;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.sets
     set handicap = coalesce(p_enabled, false)
   where id = p_set_id
     and owner_kind = 'climber'
     and status = 'live'
     and host_id = (select auth.uid())
  returning * into result;

  if result.id is null then
    raise exception 'Only the host can change a live match'
      using errcode = '42501';
  end if;

  return result;
end;
$$;

grant execute on function public.set_match_handicap(uuid, boolean) to authenticated;
revoke execute on function public.set_match_handicap(uuid, boolean) from anon, public;

-- ── 2. A player's ceiling ─────────────────────────────────────────
--
-- Your own, or a guest's if you're the host — the same split as
-- logging, and for the same reason: a guest has no session, so the
-- host is the only person who could be declaring it.
--
-- Deliberately NOT host-sets-everyone: an account-backed player
-- declares their own limit. Letting the host set it would make the
-- handicap something done TO you.

create or replace function public.set_match_ceiling(
  p_set_id uuid,
  p_player_id uuid,
  p_ceiling smallint
)
returns public.set_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_host_id uuid;
  v_seat_user uuid;
  result public.set_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_ceiling is not null and (p_ceiling < 0 or p_ceiling > 30) then
    raise exception 'Ceiling out of range' using errcode = '22023';
  end if;

  select s.host_id into v_host_id
  from public.sets s
  where s.id = p_set_id and s.owner_kind = 'climber' and s.status = 'live';

  if v_host_id is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;

  select sp.user_id into v_seat_user
  from public.set_players sp
  where sp.id = p_player_id and sp.set_id = p_set_id and sp.left_at is null;

  if not found then
    raise exception 'That player isn''t in this match' using errcode = 'P0002';
  end if;

  -- Your own seat, or a guest's if you host.
  if v_seat_user is distinct from caller_id
     and not (v_seat_user is null and v_host_id = caller_id) then
    raise exception 'You can only set your own ceiling'
      using errcode = '42501';
  end if;

  update public.set_players
     set ceiling = p_ceiling
   where id = p_player_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.set_match_ceiling(uuid, uuid, smallint) to authenticated;
revoke execute on function public.set_match_ceiling(uuid, uuid, smallint) from anon, public;

-- ── 3. Declared at creation too ───────────────────────────────────

create or replace function public.create_match(
  p_name text default null,
  p_location text default null,
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null,
  p_discipline text default 'boulder',
  p_handicap boolean default false
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_set_id uuid;
  new_code text;
  new_scale_id uuid;
  grade_label text;
  grade_ordinal smallint;
  v_discipline text := coalesce(p_discipline, 'boulder');
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_discipline not in ('boulder', 'sport', 'top-rope') then
    raise exception 'Invalid discipline' using errcode = '22023';
  end if;

  if p_grading_scale is null
     or p_grading_scale not in ('v', 'font', 'custom', 'points', 'yds', 'french') then
    raise exception 'Invalid grading scale' using errcode = '22023';
  end if;

  -- A handicap scores relative to a grade, so it needs one. `points`
  -- has no grades at all and a `custom` ladder's ordinals aren't a
  -- difficulty scale — refuse rather than silently score everything
  -- at full value, which would look like the handicap doing nothing.
  if coalesce(p_handicap, false)
     and p_grading_scale not in ('v', 'font', 'yds', 'french') then
    raise exception 'Handicap needs a graded scale' using errcode = '22023';
  end if;

  if p_grading_scale = 'custom' then
    if p_custom_grades is null or array_length(p_custom_grades, 1) is null then
      raise exception 'Custom grading scale requires at least one grade' using errcode = '22023';
    end if;
    if array_length(p_custom_grades, 1) > 50 then
      raise exception 'Custom grading scale capped at 50 grades' using errcode = '22023';
    end if;
  end if;

  new_code := public.generate_set_code();

  insert into public.sets (
    owner_kind, host_id, gym_id, code, name, location,
    grading_scale, min_grade, max_grade, discipline, handicap,
    status, starts_at, ends_at, last_activity_at
  ) values (
    'climber',
    caller_id,
    null,
    new_code,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_location, '')), ''),
    p_grading_scale,
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_min_grade else null end,
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_max_grade else null end,
    v_discipline,
    coalesce(p_handicap, false),
    'live',
    now(),
    null,
    now()
  )
  returning public.sets.id into new_set_id;

  insert into public.set_players (set_id, user_id, is_host)
  values (new_set_id, caller_id, true);

  if p_grading_scale = 'custom' then
    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.set_grades (set_id, ordinal, label)
      values (new_set_id, grade_ordinal, trim(grade_label));
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

  return query select new_set_id, new_code;
end;
$$;

drop function if exists public.create_match(text, text, text, smallint, smallint, text[], text, text);

grant execute on function public.create_match(text, text, text, smallint, smallint, text[], text, text, boolean) to authenticated;
revoke execute on function public.create_match(text, text, text, smallint, smallint, text[], text, text, boolean) from anon, public;
