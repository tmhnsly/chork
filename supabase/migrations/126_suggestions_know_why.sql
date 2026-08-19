-- ────────────────────────────────────────────────────────────────
-- Suggested friends: two sources, and each one says why
-- ────────────────────────────────────────────────────────────────
--
-- Suggestions came from one place — climbers you have shared a Match
-- with. That is a good source and a thin one: it only ever surfaces
-- people you have already been in a room with. The other obvious
-- signal is the graph itself. Someone who is friends with two of your
-- friends is very likely someone you know, and today they never
-- appear until you happen to climb with them.
--
-- ── Never gym Sets, still ───────────────────────────────────────
--
-- Migration 104 ruled that suggestions must not read gym Sets, because
-- everyone at your gym shares the current Set and that would be a
-- directory. That rule holds. Friends-of-friends is a graph edge, not
-- a membership, and it is gated on the same `allow_friend_requests`
-- and the same "not already linked" check.
--
-- ── Why the reason comes back ───────────────────────────────────
--
-- A bare avatar with an Add button asks you to trust the app's
-- judgement. "2 mutual friends" or "climbed together in July" is a
-- claim you can check against your own memory — and it is what makes
-- tapping Add feel like a decision rather than a guess. So each row
-- carries where it came from and the number behind it.
--
-- One row per person even when both sources apply: the stronger
-- reason wins, and mutual friends outranks a single shared match
-- because it is a warmer signal.

drop function if exists public.get_friend_suggestions(integer);

create or replace function public.get_friend_suggestions(p_limit integer default 10)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  reason text,
  reason_count integer,
  last_climbed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  -- Everyone I am already linked to in ANY state — friends, asked,
  -- asked me, declined either way. None of them is a suggestion.
  linked as (
    select case when f.requester_id = me.id then f.addressee_id
                else f.requester_id end as other_id
    from public.friends f, me
    where f.requester_id = me.id or f.addressee_id = me.id
  ),
  -- Source 1: people I have shared a climber-owned Match with.
  from_matches as (
    select other.user_id,
           count(distinct sp.set_id)::integer as n,
           max(s.starts_at) as last_at
    from public.set_players sp
    join public.sets s on s.id = sp.set_id
    join public.set_players other on other.set_id = sp.set_id
    cross join me
    where sp.user_id = me.id
      and s.owner_kind = 'climber'
      and other.user_id is not null
      and other.user_id <> me.id
    group by other.user_id
  ),
  -- Source 2: friends of my friends. Only ACTIVE links on both hops —
  -- a pending or declined edge is not a friend, and must not leak as
  -- one through a mutual count.
  my_friends as (
    select case when f.requester_id = me.id then f.addressee_id
                else f.requester_id end as friend_id
    from public.friends f, me
    where f.status = 'active'
      and (f.requester_id = me.id or f.addressee_id = me.id)
  ),
  from_graph as (
    select case when f.requester_id = mf.friend_id then f.addressee_id
                else f.requester_id end as user_id,
           count(distinct mf.friend_id)::integer as n
    from my_friends mf
    join public.friends f
      on f.status = 'active'
     and (f.requester_id = mf.friend_id or f.addressee_id = mf.friend_id)
    cross join me
    where case when f.requester_id = mf.friend_id then f.addressee_id
               else f.requester_id end <> me.id
    group by 1
  ),
  candidates as (
    select user_id, 'mutual_friends'::text as reason, n as reason_count,
           null::timestamptz as last_at,
           1 as rank
    from from_graph
    union all
    select user_id, 'shared_match'::text, n, last_at, 2
    from from_matches
  ),
  -- Best reason per person: mutual friends first, then more of
  -- whatever it is.
  best as (
    select distinct on (c.user_id)
           c.user_id, c.reason, c.reason_count, c.last_at
    from candidates c
    order by c.user_id, c.rank, c.reason_count desc
  )
  select
    p.id,
    p.username,
    p.name,
    p.avatar_url,
    b.reason,
    b.reason_count,
    b.last_at
  from best b
  join public.profiles p on p.id = b.user_id
  cross join me
  where me.id is not null
    and coalesce(p.allow_friend_requests, true)
    and b.user_id not in (select other_id from linked)
    -- Guests never had an account; a match seat with no user_id was
    -- already excluded above, but say it once more where it is read.
    and p.username is not null
  order by
    (b.reason = 'mutual_friends') desc,
    b.reason_count desc,
    b.last_at desc nulls last
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke execute on function public.get_friend_suggestions(integer) from anon, public;
grant execute on function public.get_friend_suggestions(integer) to authenticated;
