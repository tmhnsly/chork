-- 021: Crew feature — schema, RLS, helpers
--
-- Crews are a private social + competitive layer on top of the gym
-- leaderboard. A climber can belong to many crews. Invitations are
-- bilateral (sender + recipient) and must be accepted before the
-- recipient appears in the crew's leaderboard or feed. See the
-- full brief in-app for the UX.
--
-- Structure (ordered for forward-reference safety):
--   1. New tables: crews, crew_members, blocked_users, auth_rate_limits
--      — each created with indexes + RLS enable, but no policies yet.
--   2. Profile columns: allow_crew_invites + rate-limit counters.
--   3. Helper functions: is_active_crew_member(crew_id),
--      crew_member_status(crew_id), is_blocking(blocker, blocked),
--      bump_invite_rate_limit() — all SECURITY DEFINER with search_path=''.
--   4. Auto-insert creator as active on crew insert via trigger.
--   5. Policies for the four new tables.
--
-- Invite rate limit: 10 per user per day. profiles.invites_sent_today
-- is reset by bump_invite_rate_limit() when invites_sent_date differs
-- from CURRENT_DATE.

-- ────────────────────────────────────────────────────────────────
-- 1. Tables
-- ────────────────────────────────────────────────────────────────

create table public.crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 60),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index crews_created_by_idx on public.crews (created_by);
alter table public.crews enable row level security;

create table public.crew_members (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews(id)    on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  invited_by  uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('pending', 'active')),
  created_at  timestamptz not null default now(),
  unique (crew_id, user_id)
);
create index crew_members_crew_id_idx on public.crew_members (crew_id);
create index crew_members_user_id_idx on public.crew_members (user_id);
create index crew_members_status_idx  on public.crew_members (status) where status = 'pending';
alter table public.crew_members enable row level security;

create table public.blocked_users (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocked_users_blocker_idx on public.blocked_users (blocker_id);
create index blocked_users_blocked_idx on public.blocked_users (blocked_id);
alter table public.blocked_users enable row level security;

-- ────────────────────────────────────────────────────────────────
-- 2. Profile columns
-- ────────────────────────────────────────────────────────────────

alter table public.profiles
  add column allow_crew_invites boolean not null default true,
  add column invites_sent_today integer not null default 0
                                 check (invites_sent_today >= 0),
  add column invites_sent_date  date;

-- ────────────────────────────────────────────────────────────────
-- 3. Helper functions
-- ────────────────────────────────────────────────────────────────

-- True when the caller has an ACTIVE membership in the given crew.
-- Used by crews/crew_members SELECT policies + the invite-insert gate.
create or replace function public.is_active_crew_member(p_crew_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.crew_members
     where crew_id = p_crew_id
       and user_id = (select auth.uid())
       and status  = 'active'
  );
$$;

-- Returns the caller's crew_member.status for the given crew, or null.
create or replace function public.crew_member_status(p_crew_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select status from public.crew_members
   where crew_id = p_crew_id
     and user_id = (select auth.uid())
   limit 1;
$$;

-- Has A blocked B? Used by user-search filtering.
create or replace function public.is_blocking(p_blocker uuid, p_blocked uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocked_users
     where blocker_id = p_blocker
       and blocked_id = p_blocked
  );
$$;

grant execute on function public.is_active_crew_member(uuid) to authenticated;
grant execute on function public.crew_member_status(uuid)    to authenticated;
grant execute on function public.is_blocking(uuid, uuid)     to authenticated;
revoke execute on function public.is_active_crew_member(uuid) from anon, public;
revoke execute on function public.crew_member_status(uuid)    from anon, public;
revoke execute on function public.is_blocking(uuid, uuid)     from anon, public;

-- Atomic rate-limit bump for crew invites. Returns true if the caller
-- is still under the daily cap (and increments their counter); returns
-- false when they've hit the cap. Resets automatically when a new day
-- has rolled over.
--
-- 10/day is the per-user limit — small climbing communities don't need
-- higher and it stops any one account from spamming the search results.
create or replace function public.bump_invite_rate_limit()
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_today   date := current_date;
  v_count   integer;
  v_on_date date;
begin
  if v_uid is null then return false; end if;

  select invites_sent_today, invites_sent_date
    into v_count, v_on_date
    from public.profiles where id = v_uid;

  -- New day — reset counter before applying.
  if v_on_date is distinct from v_today then
    v_count := 0;
  end if;

  if v_count >= 10 then
    return false;
  end if;

  update public.profiles
     set invites_sent_today = v_count + 1,
         invites_sent_date  = v_today
   where id = v_uid;

  return true;
end;
$$;

grant execute on function public.bump_invite_rate_limit() to authenticated;
revoke execute on function public.bump_invite_rate_limit() from anon, public;

-- ────────────────────────────────────────────────────────────────
-- 4. Trigger: seat the creator as an active member on crew insert
-- ────────────────────────────────────────────────────────────────
-- Runs in the same transaction as the crew row so the caller's
-- crew_member row exists by the time the INSERT returns — no race
-- between "crew created" and "creator sees crew".

create or replace function public.seat_crew_creator()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.crew_members (crew_id, user_id, invited_by, status)
  values (new.id, new.created_by, new.created_by, 'active');
  return new;
end;
$$;

create trigger crews_seat_creator
  after insert on public.crews
  for each row execute function public.seat_crew_creator();

-- ────────────────────────────────────────────────────────────────
-- 5. Policies
-- ────────────────────────────────────────────────────────────────

-- crews ─────────────────────────────────────────────
create policy "Active crew members can read their crew"
  on public.crews for select to authenticated
  using (public.is_active_crew_member(id));

create policy "Signed-in users can create crews"
  on public.crews for insert to authenticated
  with check (created_by = (select auth.uid()));

-- crew_members ──────────────────────────────────────
-- A user can always see their OWN membership row regardless of status
-- (needed for the pending-invitation list on the Crew tab). Active
-- crew members can see every member row in their crew.
create policy "Read own membership"
  on public.crew_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Active members read roster"
  on public.crew_members for select to authenticated
  using (public.is_active_crew_member(crew_id));

-- Insert = sending an invite. The inviter must be an active member of
-- the crew, must record themselves as the `invited_by`, and the new
-- row must start as `pending`. Recipient's accept flow is an UPDATE.
create policy "Active members send invites"
  on public.crew_members for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and status = 'pending'
    and public.is_active_crew_member(crew_id)
    and user_id <> (select auth.uid())
  );

-- Update = accept / decline (decline is a delete below, so in practice
-- this path handles accept — pending→active).
create policy "Recipient updates own membership"
  on public.crew_members for update to authenticated
  using  (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Delete = decline (while pending) OR leave (while active). Either
-- way it's the caller's own row.
create policy "User deletes own membership"
  on public.crew_members for delete to authenticated
  using (user_id = (select auth.uid()));

-- blocked_users ─────────────────────────────────────
create policy "User reads own blocks"
  on public.blocked_users for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "User creates own blocks"
  on public.blocked_users for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "User deletes own blocks"
  on public.blocked_users for delete to authenticated
  using (blocker_id = (select auth.uid()));
