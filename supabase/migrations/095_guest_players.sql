-- ────────────────────────────────────────────────────────────────
-- Guest players: a named seat in a Match, with no account
-- ────────────────────────────────────────────────────────────────
--
-- Joining a Match is the thirty seconds in which one climber recruits
-- another, and today it costs install → sign up → code. A guest skips
-- all of it: the host adds a name, and that name climbs.
--
-- **A guest is not an account.** No `auth.users` row, no profile, no
-- sign-in. That was the other candidate design (Supabase anonymous
-- auth, claimable later) and it is deliberately not what this is —
-- an account that can self-report onto a leaderboard is trivially
-- minted by anyone holding the code. Here the host enters a guest's
-- sends, which puts a real, accountable person behind every number.
--
-- The shape follows from `profiles.id` being a foreign key to
-- `auth.users`: a profile cannot exist without an account, so a guest
-- cannot be a profile. They are a row in `set_players` with no
-- `user_id` and a display name of their own.
--
-- What this deliberately does NOT do is give guests a second scoring
-- path. A guest's send is an ordinary `route_logs` row, scored by the
-- same `compute_points`, ranked by the same `match_standings`. The
-- whole point of the Set convergence was to stop having two of those.

-- ── 1. A seat that may or may not have an account behind it ───────

-- The primary key was (set_id, user_id), which cannot hold a guest.
-- Free to change: `set_players` has 1 row.
alter table public.set_players drop constraint if exists set_players_pkey;

alter table public.set_players
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists display_name text
    check (display_name is null or char_length(trim(display_name)) between 1 and 40);

alter table public.set_players alter column user_id drop not null;
alter table public.set_players add primary key (id);

-- One seat per account per Match, as before — but only where there IS
-- an account. Guests are distinguishable only by their row, so two
-- guests may share a name (there are two Sams at the gym often
-- enough, and the host can tell them apart).
create unique index if not exists set_players_account_seat_idx
  on public.set_players (set_id, user_id)
  where user_id is not null;

-- Exactly one identity per seat: an account, or a name.
alter table public.set_players drop constraint if exists set_players_identity_ck;
alter table public.set_players add constraint set_players_identity_ck check (
  (user_id is not null and display_name is null)
  or
  (user_id is null and display_name is not null)
);

comment on column public.set_players.display_name is
  'Set only for a GUEST — a seat with no account, whose sends the '
  'host enters. An account-backed seat takes its name from profiles.';

-- ── 2. A log belongs to an account or to a seat ───────────────────
--
-- `user_id` stays the identity for every existing log — gym sends and
-- account-backed Match sends alike — so nothing already written moves
-- and the gym wall is untouched. `player_id` is the new branch, and
-- only a guest uses it.

alter table public.route_logs alter column user_id drop not null;

alter table public.route_logs
  add column if not exists player_id uuid
    references public.set_players(id) on delete cascade;

alter table public.route_logs drop constraint if exists route_logs_owner_ck;
alter table public.route_logs add constraint route_logs_owner_ck check (
  (user_id is not null and player_id is null)
  or
  (user_id is null and player_id is not null)
);

-- The existing UNIQUE (user_id, route_id) keeps working for accounts.
-- Postgres treats nulls as distinct, so it never constrains guest
-- rows — they need their own.
create unique index if not exists route_logs_player_route_idx
  on public.route_logs (player_id, route_id)
  where player_id is not null;

create index if not exists route_logs_player_id_idx
  on public.route_logs (player_id) where player_id is not null;

-- ── 3. Who may write a guest's log ────────────────────────────────
--
-- Only the host, and only for a guest seat in their own live Match.
-- A guest has no session, so there is nobody else this could be.

drop policy if exists "Users can insert own route logs in active sets" on public.route_logs;
create policy "Users can insert own route logs in active sets"
  on public.route_logs for insert
  to authenticated
  with check (
    exists (
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
             and (
               -- Your own send…
               (route_logs.user_id = (select auth.uid())
                 and public.is_set_player(s.id))
               or
               -- …or a guest's, entered by the host of this Match.
               (route_logs.player_id is not null
                 and s.host_id = (select auth.uid())
                 and exists (
                   select 1 from public.set_players sp
                   where sp.id = route_logs.player_id
                     and sp.set_id = s.id
                     and sp.user_id is null
                     and sp.left_at is null
                 ))
             ))
         )
    )
  );

drop policy if exists "Users can update their own route logs" on public.route_logs;
create policy "Users can update their own route logs"
  on public.route_logs for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
        from public.sets s
        join public.set_players sp on sp.id = route_logs.player_id
       where s.id = route_logs.set_id
         and sp.set_id = s.id
         and sp.user_id is null
         and s.owner_kind = 'climber'
         and s.host_id = (select auth.uid())
    )
  )
  with check (
    exists (
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
             and (
               (route_logs.user_id = (select auth.uid())
                 and public.is_set_player(s.id))
               or
               (route_logs.player_id is not null
                 and s.host_id = (select auth.uid())
                 and exists (
                   select 1 from public.set_players sp
                   where sp.id = route_logs.player_id
                     and sp.set_id = s.id
                     and sp.user_id is null
                     and sp.left_at is null
                 ))
             ))
         )
    )
  );

-- Only the host adds or removes guest seats. Joining as yourself is
-- still self-only (the policy from 080), untouched below it.
drop policy if exists set_players_insert on public.set_players;
create policy set_players_insert on public.set_players
  for insert to authenticated
  with check (
    -- You joining, as before.
    user_id = (select auth.uid())
    or
    -- The host seating a guest.
    (user_id is null and exists (
      select 1 from public.sets s
      where s.id = set_id
        and s.owner_kind = 'climber'
        and s.status = 'live'
        and s.host_id = (select auth.uid())
    ))
  );

drop policy if exists set_players_update on public.set_players;
create policy set_players_update on public.set_players
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id is null and exists (
      select 1 from public.sets s
      where s.id = set_id and s.host_id = (select auth.uid())
    ))
  )
  with check (
    user_id = (select auth.uid())
    or (user_id is null and exists (
      select 1 from public.sets s
      where s.id = set_id and s.host_id = (select auth.uid())
    ))
  );

-- ── 4. Triggers that fire on a guest log ──────────────────────────
--
-- `route_logs_derive_set_id` reads only `route_id`, so it is already
-- correct for a guest and needs no branch.
--
-- `sync_user_set_stats` is not. It maintains the per-(user, set)
-- aggregate behind the cached gym leaderboard, and a guest has no
-- user — so it resolved `v_user_id` to null and hit the NOT NULL on
-- `user_set_stats.user_id`, aborting the insert. Since the trigger
-- runs in the writer's transaction, that fails the SEND, not just the
-- stats.
--
-- This is the second time this trigger has caught a widening: 082
-- fixed the same shape for `gym_id` when Matches arrived. The lesson
-- is worth stating plainly — `user_set_stats` is a cache keyed on an
-- ACCOUNT, so any identity that isn't one has to be skipped here
-- rather than accommodated. A guest's score is derived live by
-- `match_standings` from `route_logs`, which is the only place it
-- needs to exist.

create or replace function public.sync_user_set_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_set_id  uuid;
  v_gym_id  uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  -- Guest log: no account, so nothing to aggregate. Bail before
  -- touching a table keyed on user_id.
  if v_user_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = old.route_id;
  else
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = new.route_id;
  end if;

  -- Route already gone (cascade race) — nothing to maintain.
  if v_set_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.user_set_stats uss
       set sends      = sub.sends,
           flashes    = sub.flashes,
           zones      = sub.zones,
           points     = sub.points,
           updated_at = now()
      from (
        select
          coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int as sends,
          coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int as flashes,
          coalesce(sum(case when rl.zone then 1 else 0 end), 0)::int as zones,
          coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone)), 0)::int as points
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where rl.user_id = v_user_id and r.set_id = v_set_id
      ) sub
     where uss.user_id = v_user_id and uss.set_id = v_set_id;
  else
    insert into public.user_set_stats (user_id, set_id, gym_id, sends, flashes, zones, points, updated_at)
    select
      v_user_id, v_set_id, v_gym_id,
      coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int,
      coalesce(sum(case when rl.zone then 1 else 0 end), 0)::int,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone)), 0)::int,
      now()
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    where rl.user_id = v_user_id and r.set_id = v_set_id
    on conflict (user_id, set_id) do update
      set sends      = excluded.sends,
          flashes    = excluded.flashes,
          zones      = excluded.zones,
          points     = excluded.points,
          updated_at = now();
  end if;

  delete from public.user_set_stats
   where user_id = v_user_id and set_id = v_set_id
     and sends = 0 and flashes = 0 and zones = 0 and points = 0;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
