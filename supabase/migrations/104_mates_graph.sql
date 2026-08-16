-- ────────────────────────────────────────────────────────────────
-- Mates: one mutual link, and no group to name
-- ────────────────────────────────────────────────────────────────
--
-- Crews need creating, naming, inviting and accepting before they are
-- worth anything, and every crew starts empty. A mate link is worth
-- something at one connection.
--
-- **Consent is unchanged.** CLAUDE.md's rule stands — there is no
-- asymmetric relationship in this app, and "follow graph" in the
-- roadmap was loose wording. Both sides still agree. What changes is
-- DISCOVERY, which is the actual cold-start problem: you never have to
-- know someone's handle, because candidates are suggested from the
-- Matches you have already climbed together (see
-- `get_mate_suggestions`). Having been on the mats together is a much
-- better signal than a search box.
--
-- Crew is left entirely alone by this migration. Phase 2 moves the
-- leaderboard over; until then both exist.

-- ── 1. The link ───────────────────────────────────────────────────
--
-- One row per pair, not two. Two rows means two things to keep in
-- step and a class of bug where they disagree about whether you are
-- mates. `requester_id` / `addressee_id` record who asked, which is
-- the only asymmetry — it decides who gets to accept.

create table if not exists public.mates (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint mates_not_self check (requester_id <> addressee_id)
);

-- The pair is unordered: one link between two people however it was
-- asked. Indexing on (least, greatest) is what makes "already linked"
-- a constraint rather than something every caller has to remember to
-- check in both directions.
create unique index if not exists mates_pair_uniq
  on public.mates (least(requester_id, addressee_id),
                   greatest(requester_id, addressee_id));

-- Both directions get looked up constantly — "my mates" reads either
-- column depending on who asked.
create index if not exists mates_requester_idx on public.mates (requester_id, status);
create index if not exists mates_addressee_idx on public.mates (addressee_id, status);

comment on table public.mates is
  'Mutual climbing links. One row per pair; requester/addressee only '
  'record who asked. Read and written exclusively through SECURITY '
  'DEFINER RPCs — deliberately NO Data API grant, so the table is '
  'unreachable from supabase-js and RLS is not the only gate.';

comment on column public.mates.status is
  'pending → asked, awaiting an answer. active → mates. declined → '
  'said no; the row persists so suggestions stop re-offering them, '
  'and only the person who declined can revive it (see request_mate).';

alter table public.mates enable row level security;

-- No policies, and no grant to `authenticated`. Every read and write
-- below is a definer function, so the table is not reachable from the
-- client at all. That is stricter than RLS and simpler to reason
-- about for a table whose whole point is who-may-see-whom.
revoke all on public.mates from anon, authenticated;

-- ── 2. Are we mates? ──────────────────────────────────────────────
--
-- Phase 2's leaderboard hangs off this, and so will the moments feed.

create or replace function public.is_mate(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mates m
    where m.status = 'active'
      and (
        (m.requester_id = (select auth.uid()) and m.addressee_id = p_user_id)
        or
        (m.addressee_id = (select auth.uid()) and m.requester_id = p_user_id)
      )
  );
$$;

revoke execute on function public.is_mate(uuid) from anon, public;
grant execute on function public.is_mate(uuid) to authenticated;

-- ── 3. Asking ─────────────────────────────────────────────────────
--
-- Idempotent, and it resolves every state a pair can already be in
-- rather than erroring and making the client work it out:
--
--   already active          → return it, no-op
--   you already asked       → return it, no-op (no second notification)
--   THEY asked you          → accept. Both of you want this; making
--                             one of you tap a different button to
--                             express the same intent is silly
--   you were declined       → refuse, silently, returning the row
--                             unchanged. No repeat asking, and no
--                             signal that tells you that you were
--                             declined rather than ignored
--   you did the declining   → revive it as your request. Changing
--                             your mind is allowed; that is the one
--                             direction a declined row may move

create or replace function public.request_mate(p_user_id uuid)
returns public.mates
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing public.mates;
  result public.mates;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_user_id is null or p_user_id = caller_id then
    raise exception 'Pick someone else' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Climber not found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.mates m
  where least(m.requester_id, m.addressee_id) = least(caller_id, p_user_id)
    and greatest(m.requester_id, m.addressee_id) = greatest(caller_id, p_user_id);

  if found then
    if existing.status = 'active' then
      return existing;
    end if;

    if existing.status = 'pending' then
      -- They asked first. Treat this as the acceptance it plainly is.
      if existing.addressee_id = caller_id then
        update public.mates
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

    update public.mates
       set requester_id = caller_id,
           addressee_id = p_user_id,
           status = 'pending',
           created_at = now(),
           responded_at = null
     where id = existing.id
    returning * into result;
    return result;
  end if;

  insert into public.mates (requester_id, addressee_id)
  values (caller_id, p_user_id)
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.request_mate(uuid) from anon, public;
grant execute on function public.request_mate(uuid) to authenticated;

-- ── 4. Answering ──────────────────────────────────────────────────

create or replace function public.respond_to_mate(
  p_mate_id uuid,
  p_accept boolean
)
returns public.mates
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result public.mates;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Only the person who was asked may answer, and only while it is
  -- still a question.
  update public.mates
     set status = case when coalesce(p_accept, false) then 'active' else 'declined' end,
         responded_at = now()
   where id = p_mate_id
     and addressee_id = caller_id
     and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'That request is no longer open' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke execute on function public.respond_to_mate(uuid, boolean) from anon, public;
grant execute on function public.respond_to_mate(uuid, boolean) to authenticated;

-- ── 5. Unlinking ──────────────────────────────────────────────────
--
-- Deletes rather than parks, and this is the one place where that is
-- right: a mate link carries no history of its own. Nothing is gated
-- on it having existed — unlike a gym membership or a Match seat,
-- where removing the row would make the climber's own logs
-- unreadable. Removing simply means you are not mates, and either of
-- you can ask again.

create or replace function public.remove_mate(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from public.mates m
  where least(m.requester_id, m.addressee_id) = least(caller_id, p_user_id)
    and greatest(m.requester_id, m.addressee_id) = greatest(caller_id, p_user_id)
    and (m.requester_id = caller_id or m.addressee_id = caller_id);
end;
$$;

revoke execute on function public.remove_mate(uuid) from anon, public;
grant execute on function public.remove_mate(uuid) to authenticated;

-- ── 6. Reading ────────────────────────────────────────────────────
--
-- `direction` saves every caller from re-deriving who asked:
--   active   → you are mates, it no longer matters who asked
--   incoming → they asked you; you have a decision to make
--   outgoing → you asked them; you are waiting
--
-- Declined rows are returned to NEITHER side. To the person who
-- declined they are noise, and to the person declined they would be
-- an answer we deliberately don't give.

create or replace function public.get_mates()
returns table (
  mate_id uuid,
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    other.id,
    other.username,
    other.name,
    other.avatar_url,
    m.status,
    case
      when m.status = 'active' then 'active'
      when m.addressee_id = (select auth.uid()) then 'incoming'
      else 'outgoing'
    end,
    m.created_at
  from public.mates m
  join public.profiles other
    on other.id = case
      when m.requester_id = (select auth.uid()) then m.addressee_id
      else m.requester_id
    end
  where (select auth.uid()) is not null
    and (m.requester_id = (select auth.uid()) or m.addressee_id = (select auth.uid()))
    and m.status <> 'declined'
  -- Decisions first, then the people you already climb with.
  order by (m.status = 'active'), other.username;
$$;

revoke execute on function public.get_mates() from anon, public;
grant execute on function public.get_mates() to authenticated;

-- ── 7. Suggestions: who you have actually climbed with ────────────
--
-- The whole reason this replaces crews. Every account-backed player
-- who has shared a Match with you and isn't already linked, most
-- recent first.
--
-- Guests are excluded by `user_id is not null` — they have no account
-- to link to, which is the entire point of a guest.
--
-- Gym Sets are excluded on purpose. Everyone at your gym shares the
-- current Set; suggesting all of them would be a directory, not a
-- signal. A Match is a group of people who chose to compete together.

create or replace function public.get_mate_suggestions(p_limit integer default 10)
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
    -- Already linked, asked, or declined — all of them mean "don't
    -- offer this person again".
    and not exists (
      select 1 from public.mates m
      where least(m.requester_id, m.addressee_id)
              = least((select auth.uid()), other.user_id)
        and greatest(m.requester_id, m.addressee_id)
              = greatest((select auth.uid()), other.user_id)
    )
  group by p.id, p.username, p.name, p.avatar_url
  order by max(s.starts_at) desc nulls last, count(*) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke execute on function public.get_mate_suggestions(integer) from anon, public;
grant execute on function public.get_mate_suggestions(integer) to authenticated;
