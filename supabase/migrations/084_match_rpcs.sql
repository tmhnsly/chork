-- ────────────────────────────────────────────────────────────────
-- Set convergence, phase 2a: the Match RPC layer
-- ────────────────────────────────────────────────────────────────
--
-- Migration 080 made `sets` able to host a climber-run Match. This
-- adds the functions the app needs to actually run one, against the
-- converged tables (`sets` / `routes` / `route_logs` / `set_players`)
-- rather than the `jam_*` mirror.
--
-- Additive and inert: nothing calls these yet. The app still reads
-- `jam_*`, and every `jam_*` function is left exactly as it is, so
-- this migration cannot regress a running Match. The UI switches over
-- in its own change, and `jam_*` is dropped only once nothing reads
-- it. See docs/roadmap.md "The Set convergence".
--
-- Deliberately NOT ported, because convergence deletes the reason
-- they exist:
--
--   • `end_jam` — 110 lines that aggregate a jam into three summary
--     tables and then delete the five live ones. A Match is a Set, and
--     Sets keep their rows, so ending one is a status change. Its
--     result page reads the same rows the live board reads, which is
--     also what retires the `row_number()` (summary) vs `dense_rank()`
--     (live) tie divergence recorded in CONTEXT.md — there is now one
--     ranking, computed one way.
--   • `upsert_jam_log` — logging a Match route is logging a route.
--     `route_logs` already takes it, 080's insert policy already
--     authorises the player branch, and 081's trigger already derives
--     `set_id`. The existing `upsertRouteLog` path serves both.
--   • `is_jam_host` — `set_players.is_host` is a column.

-- ── 1. Columns the Match container still needed ───────────────────

alter table public.sets
  -- Free text, because a Match happens wherever the climbers are:
  -- a gym Chork doesn't know about, a crag, a garage wall. A gym Set
  -- has `gym_id` for this and leaves it null.
  add column if not exists location text
    check (location is null or char_length(location) <= 120),
  -- Drives the idle sweep below. Only meaningful for a Match; a gym
  -- Set ends on its schedule, not on inactivity.
  add column if not exists last_activity_at timestamptz;

create index if not exists sets_stale_match_idx
  on public.sets (last_activity_at)
  where owner_kind = 'climber' and status = 'live';

-- Custom (named, non-numeric) ladders — "slab", "the roof", "hard".
-- Mirrors `jam_grades`. Only ever populated for `grading_scale =
-- 'custom'`, which is Match-only.
create table if not exists public.set_grades (
  set_id uuid not null references public.sets(id) on delete cascade,
  ordinal smallint not null check (ordinal between 0 and 50),
  label text not null check (char_length(label) between 1 and 40),
  primary key (set_id, ordinal)
);

alter table public.set_grades enable row level security;

-- New public tables need an explicit Data API grant — RLS alone does
-- not make a table reachable through supabase-js. See docs/migrations.md.
grant select on public.set_grades to authenticated;
revoke all on public.set_grades from anon;

drop policy if exists set_grades_select on public.set_grades;
create policy set_grades_select on public.set_grades
  for select to authenticated
  using (public.can_read_set(set_id));

-- Labels are fixed when the Match is created; there is no edit path,
-- so no insert/update policy. `create_match` writes them as definer.

-- ── 2. Activity tracking ──────────────────────────────────────────

create or replace function public.bump_set_last_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sets
     set last_activity_at = now()
   where id = new.set_id
     and owner_kind = 'climber';
  return new;
end;
$$;

revoke execute on function public.bump_set_last_activity() from anon, authenticated, public;

-- The WHEN clauses keep this off the gym hot path entirely. A Match
-- log is exactly a log with no gym, and a Match route is exactly a
-- route somebody added — so neither trigger ever fires for the 457
-- existing gym logs or for anything the admin surface writes, and no
-- statement runs just to match zero rows.
drop trigger if exists route_logs_bump_set_activity on public.route_logs;
create trigger route_logs_bump_set_activity
  after insert or update on public.route_logs
  for each row
  when (new.gym_id is null)
  execute function public.bump_set_last_activity();

drop trigger if exists routes_bump_set_activity on public.routes;
create trigger routes_bump_set_activity
  after insert on public.routes
  for each row
  when (new.added_by is not null)
  execute function public.bump_set_last_activity();

-- ── 3. Join codes ─────────────────────────────────────────────────

create or replace function public.generate_set_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
  attempt integer := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.sets where code = candidate);

    attempt := attempt + 1;
    if attempt > 50 then
      raise exception 'Could not allocate a join code' using errcode = 'P0001';
    end if;
  end loop;

  return candidate;
end;
$$;

revoke execute on function public.generate_set_code() from anon, authenticated, public;

-- ── 4. Create ─────────────────────────────────────────────────────

create or replace function public.create_match(
  p_name text default null,
  p_location text default null,
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null
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

  new_code := public.generate_set_code();

  insert into public.sets (
    owner_kind, host_id, gym_id, code, name, location,
    grading_scale, min_grade, max_grade,
    status, starts_at, ends_at, last_activity_at
  ) values (
    'climber',
    caller_id,
    null,
    new_code,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_location, '')), ''),
    p_grading_scale,
    case when p_grading_scale in ('v', 'font') then p_min_grade else null end,
    case when p_grading_scale in ('v', 'font') then p_max_grade else null end,
    'live',
    now(),
    -- Open-ended: a Match ends when someone ends it, or when the idle
    -- sweep gives up on it.
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

  -- Saving the ladder for reuse is orthogonal to this Match, and
  -- `user_custom_scales` is not Set-scoped, so it survives the
  -- convergence untouched.
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

grant execute on function public.create_match(text, text, text, smallint, smallint, text[], text) to authenticated;
revoke execute on function public.create_match(text, text, text, smallint, smallint, text[], text) from anon, public;

-- ── 5. Look up before joining ─────────────────────────────────────
--
-- Deliberately readable by any authenticated user: you hold the code,
-- which IS the invitation, and you cannot yet be a player — so the
-- normal `is_set_player` gate would make joining impossible. Returns
-- only what the join screen shows.

create or replace function public.lookup_match_by_code(p_code text)
returns table (
  set_id uuid,
  name text,
  location text,
  host_username text,
  host_display_name text,
  player_count smallint,
  grading_scale text,
  status text,
  at_cap boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id as set_id,
    s.name,
    s.location,
    p.username as host_username,
    p.name as host_display_name,
    (
      select count(*)::smallint
      from public.set_players
      where set_id = s.id and left_at is null
    ) as player_count,
    s.grading_scale,
    s.status,
    (
      select count(*)
      from public.set_players
      where set_id = s.id and left_at is null
    ) >= 20 as at_cap
  from public.sets s
  left join public.profiles p on p.id = s.host_id
  where s.code = upper(p_code)
    -- A gym Set has no code, but be explicit: this function must
    -- never become a way to read gym Sets you aren't a member of.
    and s.owner_kind = 'climber'
  limit 1;
$$;

grant execute on function public.lookup_match_by_code(text) to authenticated;
revoke execute on function public.lookup_match_by_code(text) from anon, public;

-- ── 6. Join ───────────────────────────────────────────────────────

create or replace function public.join_match(p_set_id uuid)
returns public.set_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing public.set_players;
  active_count integer;
  set_kind text;
  set_status text;
  result public.set_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select owner_kind, status into set_kind, set_status
  from public.sets where id = p_set_id;

  if set_kind is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_kind <> 'climber' then
    -- You join a gym, not a gym Set.
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_status <> 'live' then
    raise exception 'Match has ended' using errcode = 'P0001';
  end if;

  select * into existing
  from public.set_players
  where set_id = p_set_id and user_id = caller_id;

  if existing.user_id is not null then
    if existing.left_at is null then
      return existing;
    else
      raise exception 'You have already left this match' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into active_count
  from public.set_players
  where set_id = p_set_id and left_at is null;

  if active_count >= 20 then
    raise exception 'Match is full' using errcode = 'P0001';
  end if;

  insert into public.set_players (set_id, user_id)
  values (p_set_id, caller_id)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.join_match(uuid) to authenticated;
revoke execute on function public.join_match(uuid) from anon, public;

-- ── 7. Add a route ────────────────────────────────────────────────

create or replace function public.add_match_route(
  p_set_id uuid,
  p_description text default null,
  p_grade smallint default null,
  p_has_zone boolean default false
)
returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_number integer;
  result public.routes;
  set_scale text;
  set_status text;
  set_kind text;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_set_player(p_set_id) then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  -- Serialise concurrent inserts for this Set so the `number`
  -- sequence can't collide, and read the scale/status off the pinned
  -- row in the same query.
  select grading_scale, status, owner_kind
    into set_scale, set_status, set_kind
  from public.sets
  where id = p_set_id
  for update;

  if set_scale is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_kind <> 'climber' then
    -- Gym routes come from the admin surface, never from here.
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_status <> 'live' then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into next_number
  from public.routes
  where set_id = p_set_id;

  insert into public.routes (
    set_id, number, description, declared_grade, has_zone, added_by
  ) values (
    p_set_id,
    next_number,
    nullif(trim(coalesce(p_description, '')), ''),
    case when set_scale = 'points' then null else p_grade end,
    coalesce(p_has_zone, false),
    caller_id
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.add_match_route(uuid, text, smallint, boolean) to authenticated;
revoke execute on function public.add_match_route(uuid, text, smallint, boolean) from anon, public;

-- ── 8. Leaderboard ────────────────────────────────────────────────
--
-- Two deliberate improvements on `get_jam_leaderboard`, which this
-- otherwise mirrors exactly (same aggregate, same `compute_points`,
-- same four-column tiebreak, same dense_rank):
--
--   1. It is GATED. `get_jam_leaderboard` has no access check at all,
--      so any authenticated user holding a jam id can read its board
--      without joining. Ids are unguessable, so this was never a
--      practical leak, but "unguessable" is not an authorisation
--      model and a jam id travels in shared links.
--   2. `p_viewer_id` lets a service-role caller name the viewer, so
--      the attempt mask resolves against a real person. Called
--      through the service client, `auth.uid()` is null, which meant
--      the jam version masked EVERY player's attempts including the
--      caller's own. An authenticated caller can never spoof this:
--      their own `auth.uid()` wins whenever it is set.

create or replace function public.get_match_leaderboard(
  p_set_id uuid,
  p_viewer_id uuid default null
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  sends smallint,
  flashes smallint,
  zones smallint,
  points smallint,
  attempts smallint,
  last_send_at timestamptz,
  rank smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- RETURNS TABLE puts `user_id`, `points`, `attempts` … in scope as
-- variables. Every reference below is qualified, but say so
-- explicitly rather than rely on it staying that way.
#variable_conflict use_column
declare
  v_viewer uuid;
begin
  v_viewer := case
    when (select auth.uid()) is not null then (select auth.uid())
    else p_viewer_id
  end;

  if v_viewer is null then
    return;
  end if;

  if not exists (
    select 1 from public.set_players sp
    where sp.set_id = p_set_id
      and sp.user_id = v_viewer
      and sp.left_at is null
  ) then
    return;
  end if;

  return query
  with agg as (
    select
      sp.user_id as agg_user_id,
      coalesce(sum(case when rl.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when rl.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone))::smallint, 0::smallint) as points,
      coalesce(sum(rl.attempts)::smallint, 0::smallint) as attempts,
      max(rl.completed_at) as last_send_at
    -- LEFT JOIN, so a player who has joined but not climbed still
    -- appears on the board. That is the difference between a Match
    -- roster and the gym board, which only ranks people who scored.
    from public.set_players sp
    left join public.route_logs rl
      on rl.user_id = sp.user_id and rl.set_id = sp.set_id
    where sp.set_id = p_set_id
      and sp.left_at is null
    group by sp.user_id
  )
  select
    a.agg_user_id,
    p.username,
    p.name as display_name,
    p.avatar_url,
    a.sends,
    a.flashes,
    a.zones,
    a.points,
    -- Privacy: own attempts pass through, every other player sees 0.
    -- See CONTEXT.md "Attempt privacy"; pinned by attempt-privacy.test.ts.
    case when a.agg_user_id = v_viewer then a.attempts else 0::smallint end as attempts,
    a.last_send_at,
    (dense_rank() over (
      order by a.points desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last
    ))::smallint as rank
  from agg a
  left join public.profiles p on p.id = a.agg_user_id;
end;
$$;

grant execute on function public.get_match_leaderboard(uuid, uuid) to authenticated;
revoke execute on function public.get_match_leaderboard(uuid, uuid) from anon, public;

-- ── 9. The whole room, for one viewer ─────────────────────────────

create or replace function public.get_match_state_for_user(
  p_set_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  set_row public.sets;
begin
  if p_user_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.set_players
    where set_id = p_set_id
      and user_id = p_user_id
      and left_at is null
  ) then
    return null;
  end if;

  select * into set_row from public.sets where id = p_set_id;
  if set_row.id is null or set_row.owner_kind <> 'climber' then
    return null;
  end if;

  return jsonb_build_object(
    'match', to_jsonb(set_row),
    'grades', coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', ordinal, 'label', label)
        order by ordinal
      )
      from public.set_grades
      where set_id = p_set_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.number)
      from public.routes r
      where r.set_id = p_set_id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', sp.user_id,
          'username', p.username,
          'display_name', p.name,
          'avatar_url', p.avatar_url,
          'joined_at', sp.joined_at,
          'is_host', sp.is_host
        )
        order by sp.joined_at
      )
      from public.set_players sp
      left join public.profiles p on p.id = sp.user_id
      where sp.set_id = p_set_id
        and sp.left_at is null
    ), '[]'::jsonb),
    -- Own logs only. Other players' raw attempts must never reach a
    -- client; the board above carries their masked aggregate.
    'my_logs', coalesce((
      select jsonb_agg(to_jsonb(rl))
      from public.route_logs rl
      where rl.set_id = p_set_id
        and rl.user_id = p_user_id
    ), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', lb.user_id,
          'username', lb.username,
          'display_name', lb.display_name,
          'avatar_url', lb.avatar_url,
          'sends', lb.sends,
          'flashes', lb.flashes,
          'zones', lb.zones,
          'points', lb.points,
          'attempts', lb.attempts,
          'last_send_at', lb.last_send_at,
          'rank', lb.rank
        )
        order by lb.rank
      )
      from public.get_match_leaderboard(p_set_id, p_user_id) lb
    ), '[]'::jsonb)
  );
end;
$$;

-- Service-role only, exactly like `get_jam_state_for_user`: it takes
-- the viewer as an argument, so it must never be callable by someone
-- who could pass an id that isn't theirs.
revoke execute on function public.get_match_state_for_user(uuid, uuid) from anon, authenticated, public;
grant execute on function public.get_match_state_for_user(uuid, uuid) to service_role;

-- ── 10. End ───────────────────────────────────────────────────────
--
-- The whole of `end_jam`, replaced. No aggregation, no summary
-- tables, no deletes: the rows stay, and every result surface reads
-- them the same way the live board does.

create or replace function public.end_match(p_set_id uuid)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result public.sets;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_set_player(p_set_id) then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  update public.sets
     set status = 'archived',
         ends_at = now()
   where id = p_set_id
     and owner_kind = 'climber'
     -- Idempotent, and the guard against two players ending at once:
     -- the second update matches nothing rather than re-stamping
     -- `ends_at`.
     and status = 'live'
  returning * into result;

  if result.id is null then
    select * into result from public.sets
     where id = p_set_id and owner_kind = 'climber';
    if result.id is null then
      raise exception 'Match not found' using errcode = 'P0002';
    end if;
  end if;

  return result;
end;
$$;

grant execute on function public.end_match(uuid) to authenticated;
revoke execute on function public.end_match(uuid) from anon, public;

-- Idle sweep, mirroring `end_stale_jams`: a Match nobody has touched
-- in 24h is over, whatever the app thinks.
create or replace function public.end_stale_matches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_count integer;
begin
  with stale as (
    update public.sets
       set status = 'archived',
           ends_at = now()
     where owner_kind = 'climber'
       and status = 'live'
       and coalesce(last_activity_at, starts_at) < now() - interval '24 hours'
    returning id
  )
  select count(*) into ended_count from stale;

  return ended_count;
end;
$$;

revoke execute on function public.end_stale_matches() from anon, authenticated, public;
