-- Jams foundation: player-created, ephemeral, cross-gym competitive
-- climbing sessions. Live working data (routes, logs, players,
-- grades) lives in this migration. The permanent summary record
-- + end-jam transaction land in 042.
--
-- Storage strategy: these tables hold the live working state of an
-- in-progress jam only. On end_jam, all rows for that jam are
-- deleted and the permanent summary in jam_summaries captures the
-- history. Target footprint: ~1KB per completed jam.

-- ── Core tables ───────────────────────────────────

create table public.jams (
  id uuid primary key default gen_random_uuid(),
  -- 6-char join code, unambiguous alphabet (no I/O/0/1)
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name text check (char_length(name) <= 80),
  location text check (char_length(location) <= 120),
  host_id uuid not null references public.profiles(id) on delete cascade,
  grading_scale text not null check (grading_scale in ('v', 'font', 'custom')),
  -- v/font: 0..30 indices (see docs/schema.md formula). Null for custom scales.
  min_grade smallint check (min_grade is null or min_grade between 0 and 30),
  max_grade smallint check (max_grade is null or max_grade between 0 and 30),
  status text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Bumped on any activity — used by end_stale_jams cron to sweep abandoned jams
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index jams_host_id_idx on public.jams (host_id);
create index jams_status_live_idx on public.jams (status) where status = 'live';
create index jams_stale_idx on public.jams (last_activity_at) where status = 'live';

-- Per-jam custom grade labels. Not populated for v/font jams
-- (those rely on formatGrade() in the app).
create table public.jam_grades (
  jam_id uuid not null references public.jams(id) on delete cascade,
  ordinal smallint not null check (ordinal >= 0 and ordinal <= 50),
  label text not null check (char_length(label) between 1 and 40),
  primary key (jam_id, ordinal)
);

-- Players — one row per user who joined. Leaving soft-deletes via
-- `left_at`. Hard deletes happen only when the jam is ended.
create table public.jam_players (
  jam_id uuid not null references public.jams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (jam_id, user_id)
);

create index jam_players_user_id_idx on public.jam_players (user_id);
create index jam_players_active_idx on public.jam_players (jam_id) where left_at is null;

-- Routes — numbered within a jam, added by any player as they go.
create table public.jam_routes (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams(id) on delete cascade,
  number integer not null check (number > 0),
  description text check (char_length(description) <= 240),
  -- 0..30 for v/font (numeric encoding). Ordinal for custom (matches jam_grades.ordinal).
  grade smallint check (grade is null or grade between 0 and 50),
  has_zone boolean not null default false,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (jam_id, number)
);

create index jam_routes_jam_id_idx on public.jam_routes (jam_id, number);

-- Per-user per-route attempt log. Upserted in place. Mirrors
-- route_logs' (user, route) unique constraint for offline-queue
-- idempotency.
create table public.jam_logs (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams(id) on delete cascade,
  jam_route_id uuid not null references public.jam_routes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempts integer not null default 0 check (attempts between 0 and 999),
  completed boolean not null default false,
  completed_at timestamptz,
  zone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, jam_route_id)
);

create index jam_logs_jam_id_idx on public.jam_logs (jam_id);
create index jam_logs_user_id_idx on public.jam_logs (user_id);
create index jam_logs_route_completed_idx on public.jam_logs (jam_route_id, completed);

-- Saved custom scales — climbers can keep a named library of grade
-- scales (e.g. "The garage board", "Monday night circuit") and
-- pre-populate the custom-grade list when creating a future jam.
create table public.user_custom_scales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create index user_custom_scales_user_id_idx on public.user_custom_scales (user_id);

create table public.user_custom_scale_grades (
  scale_id uuid not null references public.user_custom_scales(id) on delete cascade,
  ordinal smallint not null check (ordinal >= 0 and ordinal <= 50),
  label text not null check (char_length(label) between 1 and 40),
  primary key (scale_id, ordinal)
);

alter table public.user_custom_scales enable row level security;
alter table public.user_custom_scale_grades enable row level security;

create policy user_custom_scales_select on public.user_custom_scales
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_custom_scales_insert on public.user_custom_scales
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_custom_scales_update on public.user_custom_scales
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_custom_scales_delete on public.user_custom_scales
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy user_custom_scale_grades_select on public.user_custom_scale_grades
  for select to authenticated
  using (exists (
    select 1 from public.user_custom_scales
    where id = scale_id and user_id = (select auth.uid())
  ));

create policy user_custom_scale_grades_insert on public.user_custom_scale_grades
  for insert to authenticated
  with check (exists (
    select 1 from public.user_custom_scales
    where id = scale_id and user_id = (select auth.uid())
  ));

create policy user_custom_scale_grades_update on public.user_custom_scale_grades
  for update to authenticated
  using (exists (
    select 1 from public.user_custom_scales
    where id = scale_id and user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.user_custom_scales
    where id = scale_id and user_id = (select auth.uid())
  ));

create policy user_custom_scale_grades_delete on public.user_custom_scale_grades
  for delete to authenticated
  using (exists (
    select 1 from public.user_custom_scales
    where id = scale_id and user_id = (select auth.uid())
  ));

-- ── Role helpers ──────────────────────────────────
-- SECURITY DEFINER with search_path = '' prevents schema injection
-- and lets the helper bypass RLS on jam_players (otherwise the
-- lookup would be gated by the very RLS policy calling it).

create or replace function public.is_jam_player(p_jam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jam_players
    where jam_id = p_jam_id
      and user_id = (select auth.uid())
      and left_at is null
  );
$$;

grant execute on function public.is_jam_player(uuid) to authenticated;
revoke execute on function public.is_jam_player(uuid) from anon, public;

-- Signals whether the user is the host of a live jam. Used for the
-- "only host sees the end-jam option" pattern in the UI but NOT as
-- an RLS gate on its own — any player can end a jam per spec.
create or replace function public.is_jam_host(p_jam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jams
    where id = p_jam_id
      and host_id = (select auth.uid())
  );
$$;

grant execute on function public.is_jam_host(uuid) to authenticated;
revoke execute on function public.is_jam_host(uuid) from anon, public;

-- ── RLS ───────────────────────────────────────────

alter table public.jams enable row level security;
alter table public.jam_grades enable row level security;
alter table public.jam_players enable row level security;
alter table public.jam_routes enable row level security;
alter table public.jam_logs enable row level security;

-- jams: readable by any authenticated user (payload is safe — needed
-- for the join-by-code confirm screen before the caller is a player).
-- Inserts via the create_jam RPC under SECURITY DEFINER; direct INSERT
-- allowed for the host so the server action's insert is auditable.
create policy jams_select on public.jams
  for select to authenticated
  using (true);

create policy jams_insert on public.jams
  for insert to authenticated
  with check (host_id = (select auth.uid()));

create policy jams_update on public.jams
  for update to authenticated
  using (public.is_jam_player(id) and status = 'live')
  with check (public.is_jam_player(id) and status = 'live');

-- No DELETE policy — jams are only deleted by the end_jam RPC under
-- service role.

-- jam_grades: read when you're a player. Writes only happen inside
-- create_jam (SECURITY DEFINER) so no INSERT policy is needed for
-- regular clients; RLS default-deny blocks direct writes.
create policy jam_grades_select on public.jam_grades
  for select to authenticated
  using (public.is_jam_player(jam_id));

-- jam_players: players see the roster; can insert self into a live,
-- under-cap jam; can soft-delete self via UPDATE setting left_at.
create policy jam_players_select on public.jam_players
  for select to authenticated
  using (public.is_jam_player(jam_id));

create policy jam_players_insert on public.jam_players
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.jams j
      where j.id = jam_id and j.status = 'live'
    )
    and (
      select count(*) < 20
      from public.jam_players
      where jam_id = jam_players.jam_id
        and left_at is null
    )
  );

create policy jam_players_update on public.jam_players
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- jam_routes: players read and mutate. Any player can add / edit
-- (group self-polices). Only while the jam is live.
create policy jam_routes_select on public.jam_routes
  for select to authenticated
  using (public.is_jam_player(jam_id));

create policy jam_routes_insert on public.jam_routes
  for insert to authenticated
  with check (
    public.is_jam_player(jam_id)
    and exists (
      select 1 from public.jams j
      where j.id = jam_id and j.status = 'live'
    )
  );

create policy jam_routes_update on public.jam_routes
  for update to authenticated
  using (
    public.is_jam_player(jam_id)
    and exists (
      select 1 from public.jams j
      where j.id = jam_id and j.status = 'live'
    )
  )
  with check (public.is_jam_player(jam_id));

-- jam_logs: players see everyone's logs (needed for live leaderboard
-- + the grid's co-player send state). Mutations self-only, jam-live only.
create policy jam_logs_select on public.jam_logs
  for select to authenticated
  using (public.is_jam_player(jam_id));

create policy jam_logs_insert on public.jam_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_jam_player(jam_id)
    and exists (
      select 1 from public.jams j
      where j.id = jam_id and j.status = 'live'
    )
  );

create policy jam_logs_update on public.jam_logs
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_jam_player(jam_id)
    and exists (
      select 1 from public.jams j
      where j.id = jam_id and j.status = 'live'
    )
  )
  with check (user_id = (select auth.uid()));

create policy jam_logs_delete on public.jam_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── Code generation ───────────────────────────────
-- 6-char alphabet of 32 chars → 32^6 ≈ 1B combinations. Retries
-- on collision; raises after 10 attempts so we don't spin.

create or replace function public.generate_jam_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  attempt integer := 0;
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from public.jams where code = candidate) then
      return candidate;
    end if;
    attempt := attempt + 1;
    if attempt >= 10 then
      raise exception 'Could not generate unique jam code after % attempts', attempt;
    end if;
  end loop;
end;
$$;

-- Service role only — authenticated users shouldn't be able to
-- pre-generate codes (they get one via create_jam which calls this).
revoke execute on function public.generate_jam_code() from public, anon, authenticated;
grant execute on function public.generate_jam_code() to service_role;

-- ── Live-activity bump trigger ────────────────────
-- Any write to jam_logs / jam_routes updates the parent jam's
-- last_activity_at so the abandon sweep knows this jam is alive.

create or replace function public.bump_jam_last_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_jam_id uuid;
begin
  target_jam_id := coalesce(new.jam_id, old.jam_id);
  update public.jams
     set last_activity_at = now()
   where id = target_jam_id
     and status = 'live';
  return new;
end;
$$;

create trigger jam_logs_bump_activity
  after insert or update or delete on public.jam_logs
  for each row execute function public.bump_jam_last_activity();

create trigger jam_routes_bump_activity
  after insert or update or delete on public.jam_routes
  for each row execute function public.bump_jam_last_activity();

create trigger jam_logs_updated_at
  before update on public.jam_logs
  for each row execute function public.bump_jam_last_activity();

-- ── RPCs ──────────────────────────────────────────

-- create_jam: atomic host-seats-self. Returns the new jam id + code
-- so the client can navigate directly.
create or replace function public.create_jam(
  p_name text,
  p_location text,
  p_grading_scale text,
  p_min_grade smallint,
  p_max_grade smallint,
  p_custom_grades text[],
  p_save_scale_name text
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

  if p_grading_scale not in ('v', 'font', 'custom') then
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
    nullif(trim(p_name), ''),
    nullif(trim(p_location), ''),
    caller_id,
    p_grading_scale,
    case when p_grading_scale in ('v', 'font') then p_min_grade else null end,
    case when p_grading_scale in ('v', 'font') then p_max_grade else null end,
    'live'
  )
  returning public.jams.id into new_jam_id;

  -- Seat the host as the first player in the same transaction so
  -- they're never outside their own jam.
  insert into public.jam_players (jam_id, user_id)
  values (new_jam_id, caller_id);

  -- Custom scale: snapshot the grades into jam_grades.
  if p_grading_scale = 'custom' then
    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.jam_grades (jam_id, ordinal, label)
      values (new_jam_id, grade_ordinal, trim(grade_label));
      grade_ordinal := grade_ordinal + 1;
    end loop;
  end if;

  -- Optionally persist the custom scale to the user's library for reuse.
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

-- join_jam_by_code: returns safe-to-show metadata for the confirm
-- screen. Doesn't add the caller — that's a separate call.
create or replace function public.join_jam_by_code(p_code text)
returns table (
  jam_id uuid,
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
    j.id as jam_id,
    j.name,
    j.location,
    p.username as host_username,
    p.name as host_display_name,
    (
      select count(*)::smallint
      from public.jam_players
      where jam_id = j.id and left_at is null
    ) as player_count,
    j.grading_scale,
    j.status,
    (
      select count(*)
      from public.jam_players
      where jam_id = j.id and left_at is null
    ) >= 20 as at_cap
  from public.jams j
  left join public.profiles p on p.id = j.host_id
  where j.code = upper(p_code)
  limit 1;
$$;

grant execute on function public.join_jam_by_code(text) to authenticated;
revoke execute on function public.join_jam_by_code(text) from anon, public;

-- add_jam_player: joins the caller. The RLS insert policy already
-- enforces cap + live-status, but the RPC gives us friendlier
-- exceptions + surfaces "already joined" / "already left".
create or replace function public.add_jam_player(p_jam_id uuid)
returns public.jam_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing public.jam_players;
  active_count integer;
  jam_status text;
  result public.jam_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select status into jam_status from public.jams where id = p_jam_id;
  if jam_status is null then
    raise exception 'Jam not found' using errcode = 'P0002';
  end if;
  if jam_status <> 'live' then
    raise exception 'Jam has ended' using errcode = 'P0001';
  end if;

  select * into existing
  from public.jam_players
  where jam_id = p_jam_id and user_id = caller_id;

  if existing.user_id is not null then
    if existing.left_at is null then
      -- Already an active player; no-op.
      return existing;
    else
      raise exception 'You have already left this jam' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into active_count
  from public.jam_players
  where jam_id = p_jam_id and left_at is null;

  if active_count >= 20 then
    raise exception 'Jam is full' using errcode = 'P0001';
  end if;

  insert into public.jam_players (jam_id, user_id)
  values (p_jam_id, caller_id)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.add_jam_player(uuid) to authenticated;
revoke execute on function public.add_jam_player(uuid) from anon, public;

-- add_jam_route: inserts route with auto-assigned sequential number.
create or replace function public.add_jam_route(
  p_jam_id uuid,
  p_description text,
  p_grade smallint,
  p_has_zone boolean
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
    nullif(trim(p_description), ''),
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

-- update_jam_route: any player may edit any route's metadata.
create or replace function public.update_jam_route(
  p_route_id uuid,
  p_description text,
  p_grade smallint,
  p_has_zone boolean
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
     set description = nullif(trim(p_description), ''),
         grade = p_grade,
         has_zone = coalesce(p_has_zone, has_zone)
   where id = p_route_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.update_jam_route(uuid, text, smallint, boolean) to authenticated;
revoke execute on function public.update_jam_route(uuid, text, smallint, boolean) from anon, public;

-- upsert_jam_log: idempotent write keyed on (user_id, jam_route_id).
-- Matches the route_logs upsert pattern so offline-queue retries
-- can never double-insert.
create or replace function public.upsert_jam_log(
  p_jam_route_id uuid,
  p_attempts integer,
  p_completed boolean,
  p_zone boolean
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

-- leave_jam: soft-deletes the caller's player row.
create or replace function public.leave_jam(p_jam_id uuid)
returns public.jam_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result public.jam_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.jam_players
     set left_at = now()
   where jam_id = p_jam_id
     and user_id = caller_id
     and left_at is null
  returning * into result;

  if result.user_id is null then
    raise exception 'Not an active player in this jam' using errcode = 'P0001';
  end if;

  return result;
end;
$$;

grant execute on function public.leave_jam(uuid) to authenticated;
revoke execute on function public.leave_jam(uuid) from anon, public;

-- ── Live reads ────────────────────────────────────

-- get_jam_state: single-RPC hydrator for the jam screen. One round
-- trip gets jam metadata + grades + routes + active players + the
-- caller's own logs + the leaderboard. Mirrors get_profile_summary.
create or replace function public.get_jam_state(p_jam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  jam_row public.jams;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_jam_player(p_jam_id) then
    raise exception 'Not a player in this jam' using errcode = '42501';
  end if;

  select * into jam_row from public.jams where id = p_jam_id;
  if jam_row.id is null then
    raise exception 'Jam not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'jam', to_jsonb(jam_row),
    'grades', coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', ordinal, 'label', label)
        order by ordinal
      )
      from public.jam_grades
      where jam_id = p_jam_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.number)
      from public.jam_routes r
      where r.jam_id = p_jam_id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', jp.user_id,
          'username', p.username,
          'display_name', p.name,
          'avatar_url', p.avatar_url,
          'joined_at', jp.joined_at,
          'is_host', (jp.user_id = jam_row.host_id)
        )
        order by jp.joined_at
      )
      from public.jam_players jp
      left join public.profiles p on p.id = jp.user_id
      where jp.jam_id = p_jam_id
        and jp.left_at is null
    ), '[]'::jsonb),
    'my_logs', coalesce((
      select jsonb_agg(to_jsonb(l))
      from public.jam_logs l
      where l.jam_id = p_jam_id
        and l.user_id = caller_id
    ), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(row_to_jsonb(lb) order by lb.rank)
      from public.get_jam_leaderboard(p_jam_id) lb
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_jam_state(uuid) to authenticated;
revoke execute on function public.get_jam_state(uuid) from anon, public;

-- get_jam_leaderboard: applies the points formula inline. Zone adds
-- +1 regardless of completion. Tiebreak: points > flashes > sends >
-- earliest final completed_at.
create or replace function public.get_jam_leaderboard(p_jam_id uuid)
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
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select
      jp.user_id,
      coalesce(sum(case when l.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(
        case
          when l.completed and l.attempts = 1 then 4
          when l.completed and l.attempts = 2 then 3
          when l.completed and l.attempts = 3 then 2
          when l.completed and l.attempts >= 4 then 1
          else 0
        end
      )::smallint, 0::smallint)
      + coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as points,
      coalesce(sum(l.attempts)::smallint, 0::smallint) as attempts,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l
      on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
  )
  select
    a.user_id,
    p.username,
    p.name as display_name,
    p.avatar_url,
    a.sends,
    a.flashes,
    a.zones,
    a.points,
    a.attempts,
    a.last_send_at,
    (dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last))::smallint as rank
  from agg a
  left join public.profiles p on p.id = a.user_id
  where public.is_jam_player(p_jam_id);
$$;

grant execute on function public.get_jam_leaderboard(uuid) to authenticated;
revoke execute on function public.get_jam_leaderboard(uuid) from anon, public;

-- get_active_jam_for_user: used by the ActiveJamBanner on /jam.
-- Returns the most recent live jam the caller is still a player in.
create or replace function public.get_active_jam_for_user()
returns table (
  jam_id uuid,
  name text,
  location text,
  code text,
  player_count smallint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id as jam_id,
    j.name,
    j.location,
    j.code,
    (
      select count(*)::smallint
      from public.jam_players
      where jam_id = j.id and left_at is null
    ) as player_count,
    jp.joined_at
  from public.jam_players jp
  join public.jams j on j.id = jp.jam_id
  where jp.user_id = (select auth.uid())
    and jp.left_at is null
    and j.status = 'live'
  order by jp.joined_at desc
  limit 1;
$$;

grant execute on function public.get_active_jam_for_user() to authenticated;
revoke execute on function public.get_active_jam_for_user() from anon, public;
