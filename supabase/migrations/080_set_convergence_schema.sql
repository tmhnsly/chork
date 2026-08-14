-- ────────────────────────────────────────────────────────────────
-- Set convergence, phase 1: one container, two owners
-- ────────────────────────────────────────────────────────────────
--
-- A Match (climber-run) and a gym Set are the same thing at different
-- settings — numbered routes, tick them, points, leaderboard — and
-- they differ only in who runs it, how long it lives, and where the
-- routes come from. Today they're two table families (`jam_*`
-- mirroring `routes`/`route_logs`) which means every game mode,
-- every scoring change and every privacy rule has to be built twice.
-- See CONTEXT.md "Set" / "Match" and docs/roadmap.md.
--
-- This migration makes `sets` able to host both. It is deliberately
-- ADDITIVE: no jam data moves, no gym data changes, and every
-- existing policy is replaced by a superset of itself. The jam_*
-- tables are left in place and are dropped in a later migration once
-- the app no longer reads them.
--
-- Safe to apply because there is nothing to migrate: `jams`,
-- `jam_routes` and `jam_logs` are all empty (verified against the
-- live database before writing this). The 457 real `route_logs` rows
-- are untouched apart from gaining a denormalised `set_id`.

-- ── 1. sets: host a climber-run Match ─────────────────────────────

-- A Match has no gym, no fixed end, and (on a custom scale) no
-- numeric grade ceiling. None of those can stay NOT NULL.
alter table public.sets alter column gym_id drop not null;
alter table public.sets alter column ends_at drop not null;
alter table public.sets alter column max_grade drop not null;

alter table public.sets
  -- Explicit rather than inferred from `gym_id is null`, because a
  -- Match CAN name a gym: a climber-run Match at a venue is exactly
  -- the signal we want ("23 climbers ran Matches here this month").
  -- Inferring ownership from the venue would throw that away.
  add column if not exists owner_kind text not null default 'gym'
    check (owner_kind in ('gym', 'climber')),
  add column if not exists host_id uuid references public.profiles(id) on delete set null,
  -- 6-char join code, unambiguous alphabet (no I/O/0/1) — same shape
  -- as `jams.code`, because it exists to be read aloud across a mat.
  add column if not exists code text
    check (code is null or code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  add column if not exists min_grade smallint
    check (min_grade is null or min_grade between 0 and 30);

-- Each kind needs its own identity fields present.
alter table public.sets drop constraint if exists sets_owner_shape_ck;
alter table public.sets add constraint sets_owner_shape_ck check (
  (owner_kind = 'gym' and gym_id is not null and code is null)
  or
  (owner_kind = 'climber' and host_id is not null and code is not null)
);

create unique index if not exists sets_code_key
  on public.sets (code) where code is not null;
create index if not exists sets_host_id_idx
  on public.sets (host_id) where host_id is not null;

-- Matches allow a custom (named, non-numeric) scale; gym Sets don't.
alter table public.sets drop constraint if exists sets_grading_scale_check;
alter table public.sets add constraint sets_grading_scale_check
  check (grading_scale in ('v', 'font', 'points', 'custom'));

-- `archived` doubles as "finished" for a Match. Deliberately NOT a
-- separate `ended` value: two words for one state is how the legacy
-- `active`/`status` split started.
comment on column public.sets.owner_kind is
  'gym = run by a gym (the paid product). climber = a Match. Both are '
  'Sets; see CONTEXT.md. `archived` means finished for either.';

-- ── 2. routes: carry what a Match route needs ─────────────────────
--
-- Gym routes are set by setters and numbered ahead of time; Match
-- routes are added live by whoever is climbing, so they carry a
-- free-text description ("blue crimps, arête") and their own grade
-- rather than inheriting the Set's scale ceiling.
alter table public.routes
  add column if not exists description text
    check (description is null or char_length(description) <= 240),
  add column if not exists added_by uuid references public.profiles(id) on delete set null,
  add column if not exists grade smallint
    check (grade is null or grade between 0 and 30);

create index if not exists routes_added_by_idx
  on public.routes (added_by) where added_by is not null;

-- ── 3. route_logs: reachable without a gym ────────────────────────
--
-- `gym_id` was denormalised onto this table by migration 002 so RLS
-- could check membership without joining routes → sets on every row.
-- A Match log has no gym, so that column goes nullable — and the
-- same trick is applied again for the other branch: denormalise
-- `set_id` so the "am I a player in this Match?" check is a single
-- indexed lookup rather than the join 002 removed.
alter table public.route_logs
  add column if not exists set_id uuid references public.sets(id) on delete cascade;

update public.route_logs rl
   set set_id = r.set_id
  from public.routes r
 where r.id = rl.route_id
   and rl.set_id is null;

alter table public.route_logs alter column set_id set not null;
alter table public.route_logs alter column gym_id drop not null;

create index if not exists route_logs_set_id_idx on public.route_logs (set_id);

-- Migration 073's invariant (a log names the gym its route actually
-- belongs to) is preserved and extended in the INSERT policy below
-- rather than as a CHECK, because it spans three tables.

-- ── 4. set_players: who is in a Match ─────────────────────────────
create table if not exists public.set_players (
  set_id uuid not null references public.sets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  is_host boolean not null default false,
  primary key (set_id, user_id)
);

create index if not exists set_players_user_id_idx on public.set_players (user_id);
create index if not exists set_players_active_idx
  on public.set_players (set_id) where left_at is null;

alter table public.set_players enable row level security;

-- New public tables need an explicit Data API grant — RLS alone does
-- not make a table reachable through supabase-js. See
-- docs/migrations.md.
grant select, insert, update, delete on public.set_players to authenticated;
revoke all on public.set_players from anon;

-- ── 5. Membership helper ──────────────────────────────────────────
create or replace function public.is_set_player(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.set_players
    where set_id = p_set_id
      and user_id = (select auth.uid())
      and left_at is null
  );
$$;

grant execute on function public.is_set_player(uuid) to authenticated;
revoke execute on function public.is_set_player(uuid) from anon, public;

/**
 * Can the caller see this Set at all?
 *
 * The two access models the convergence has to serve, in one place
 * so every policy below reads the same way:
 *   • gym Set  — you're a member of its gym
 *   • Match    — you're one of its players
 */
create or replace function public.can_read_set(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sets s
    where s.id = p_set_id
      and (
        (s.owner_kind = 'gym' and public.is_gym_member(s.gym_id))
        or
        (s.owner_kind = 'climber' and public.is_set_player(s.id))
      )
  );
$$;

grant execute on function public.can_read_set(uuid) to authenticated;
revoke execute on function public.can_read_set(uuid) from anon, public;

-- ── 6. Policies: same rules, both owners ──────────────────────────

drop policy if exists set_players_select on public.set_players;
create policy set_players_select on public.set_players
  for select to authenticated
  using (public.can_read_set(set_id));

-- Joining is how a Match grows; leaving is your own row. Adding
-- SOMEONE ELSE to a Match is not a thing (guests get their own
-- identity — see the roadmap), so insert is self-only.
drop policy if exists set_players_insert on public.set_players;
create policy set_players_insert on public.set_players
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists set_players_update on public.set_players;
create policy set_players_update on public.set_players
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Gym members can read sets" on public.sets;
create policy "Members and players can read sets" on public.sets
  for select to authenticated
  using (
    (owner_kind = 'gym' and public.is_gym_member(gym_id))
    or
    (owner_kind = 'climber' and public.is_set_player(id))
  );

drop policy if exists "Gym members can read routes" on public.routes;
create policy "Members and players can read routes" on public.routes
  for select to authenticated
  using (public.can_read_set(set_id));

drop policy if exists "Gym members can read route logs" on public.route_logs;
create policy "Members and players can read route logs" on public.route_logs
  for select to authenticated
  using (
    -- Gym branch first and unchanged: it's the hot path (457 rows
    -- today, all gym) and stays a single indexed check on the
    -- denormalised column.
    (gym_id is not null and public.is_gym_member(gym_id))
    or
    (gym_id is null and public.is_set_player(set_id))
  );

-- Insert keeps every condition migration 073 established — it's your
-- log, you're in that gym, the set is live, and the route really
-- belongs to the gym you named — and adds the Match branch, where
-- being a player of the Set the route belongs to is the equivalent.
drop policy if exists "Users can insert own route logs in active sets" on public.route_logs;
create policy "Users can insert own route logs in active sets"
  on public.route_logs for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.routes r
        join public.sets s on s.id = r.set_id
       where r.id = route_id
         and s.id = route_logs.set_id
         and s.status = 'live'
         and (
           (s.owner_kind = 'gym'
             and route_logs.gym_id = s.gym_id
             and public.is_gym_member(s.gym_id))
           or
           (s.owner_kind = 'climber'
             and route_logs.gym_id is null
             and public.is_set_player(s.id))
         )
    )
  );

-- Match routes are added live by any player, which gym routes never
-- are (those come from the admin surface under is_gym_admin).
drop policy if exists set_routes_insert_by_player on public.routes;
create policy set_routes_insert_by_player on public.routes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sets s
      where s.id = set_id
        and s.owner_kind = 'climber'
        and s.status = 'live'
        and public.is_set_player(s.id)
    )
  );

-- Jams are intentionally collaborative: any player may edit any
-- route's metadata. Deliberate product decision, not an oversight —
-- see CONTEXT.md "Match".
drop policy if exists set_routes_update_by_player on public.routes;
create policy set_routes_update_by_player on public.routes
  for update to authenticated
  using (
    exists (
      select 1 from public.sets s
      where s.id = set_id
        and s.owner_kind = 'climber'
        and s.status = 'live'
        and public.is_set_player(s.id)
    )
  );
