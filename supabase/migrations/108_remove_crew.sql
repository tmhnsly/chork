-- ────────────────────────────────────────────────────────────────
-- Crews are gone
-- ────────────────────────────────────────────────────────────────
--
-- Replaced by friends (104–106) and the friends board (107), which
-- landed FIRST so the private leaderboard was never missing. A crew's
-- one real payoff was ranking your group on the gym's current Set;
-- that now works with the group you never had to name.
--
-- One crew existed, with 26 seeded members and no real use.
--
-- ── The invite toggle survives, repurposed and finally enforced ──
--
-- `profiles.allow_crew_invites` meant "people may ask to add me",
-- which is exactly what it should mean for friend requests. It is
-- renamed rather than dropped — but `request_friend` never consulted
-- it, so until this migration it was a privacy switch that did
-- nothing. That is worse than not having one, so the check goes in
-- here alongside the rename.
--
-- `invites_sent_today` / `invites_sent_date` go: they were crew's own
-- per-day invite quota. Friend requests are covered by the standard
-- `gateSignedInMutation` rate limit like every other mutation.

-- ── 1. Tables first ───────────────────────────────────────────────
--
-- Cascade takes the triggers and policies hanging off them, which is
-- why this precedes the function drops — the lesson from migration
-- 089, where dropping a function first failed on the policies still
-- referencing it.

drop table if exists public.crew_members cascade;
drop table if exists public.crews cascade;

-- ── 2. Then every function that spoke crew ────────────────────────
--
-- Enumerated rather than listed by signature: `get_crew_activity_feed`
-- has two overloads, and a hand-written list is how you leave one
-- behind.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like '%crew%'
  loop
    execute format('drop function if exists %s cascade', fn.sig);
  end loop;
end $$;

-- ── 3. The invite toggle becomes a friend-request toggle ──────────

alter table public.profiles
  rename column allow_crew_invites to allow_friend_requests;

comment on column public.profiles.allow_friend_requests is
  'Whether other climbers may send this person a friend request. '
  'Enforced in request_friend — a switch that only the UI honoured '
  'would be decoration.';

alter table public.profiles drop column if exists invites_sent_today;
alter table public.profiles drop column if exists invites_sent_date;

-- ── 4. Enforce it ─────────────────────────────────────────────────
--
-- Same body as migration 106 with the opt-out check added. Refuses
-- with the same message whether they have requests off or simply
-- don't exist — "no such climber" and "that climber doesn't want
-- requests" are both answers a stranger shouldn't be able to
-- distinguish by probing.

create or replace function public.request_friend(p_user_id uuid)
returns public.friends
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing public.friends;
  result public.friends;
  target record;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_user_id is null or p_user_id = caller_id then
    raise exception 'Pick someone else' using errcode = '22023';
  end if;

  select id, allow_friend_requests into target
  from public.profiles where id = p_user_id;

  if target.id is null or not coalesce(target.allow_friend_requests, true) then
    raise exception 'Climber not found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.friends f
  where least(f.requester_id, f.addressee_id) = least(caller_id, p_user_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(caller_id, p_user_id);

  if found then
    if existing.status = 'active' then
      return existing;
    end if;

    if existing.status = 'pending' then
      -- They asked first. Treat this as the acceptance it plainly is.
      if existing.addressee_id = caller_id then
        update public.friends
           set status = 'active', responded_at = now()
         where id = existing.id
        returning * into result;
        return result;
      end if;
      return existing;
    end if;

    -- declined
    if existing.requester_id = caller_id then
      -- You are the one who was turned down. Nothing happens, and the
      -- return value says nothing about why.
      return existing;
    end if;

    update public.friends
       set requester_id = caller_id,
           addressee_id = p_user_id,
           status = 'pending',
           created_at = now(),
           responded_at = null
     where id = existing.id
    returning * into result;
    return result;
  end if;

  insert into public.friends (requester_id, addressee_id)
  values (caller_id, p_user_id)
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.request_friend(uuid) from anon, public;
grant execute on function public.request_friend(uuid) to authenticated;

-- ── 5. …and out of the suggestion list ────────────────────────────
--
-- Offering someone who has requests off would produce a button that
-- always errors.

create or replace function public.get_friend_suggestions(p_limit integer default 10)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  shared_matches integer,
  last_climbed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select sp.set_id
    from public.set_players sp
    join public.sets s on s.id = sp.set_id
    where sp.user_id = (select auth.uid())
      and s.owner_kind = 'climber'
  )
  select
    p.id,
    p.username,
    p.name,
    p.avatar_url,
    count(*)::integer,
    max(s.starts_at)
  from mine
  join public.set_players other on other.set_id = mine.set_id
  join public.sets s on s.id = mine.set_id
  join public.profiles p on p.id = other.user_id
  where (select auth.uid()) is not null
    and other.user_id is not null
    and other.user_id <> (select auth.uid())
    and coalesce(p.allow_friend_requests, true)
    and not exists (
      select 1 from public.friends f
      where least(f.requester_id, f.addressee_id)
              = least((select auth.uid()), other.user_id)
        and greatest(f.requester_id, f.addressee_id)
              = greatest((select auth.uid()), other.user_id)
    )
  group by p.id, p.username, p.name, p.avatar_url
  order by max(s.starts_at) desc nulls last, count(*) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke execute on function public.get_friend_suggestions(integer) from anon, public;
grant execute on function public.get_friend_suggestions(integer) to authenticated;

-- ── 6. The crew notification kinds ────────────────────────────────
--
-- Mirrors `NotificationPayloads` in
-- `src/lib/data/notification-kinds.ts`, pinned by its own test. Rows
-- go before the constraint tightens, or the ALTER fails validating
-- them.

delete from public.notifications where kind like 'crew_%';

alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'friend_request_received',
    'friend_request_accepted'
  ]));
