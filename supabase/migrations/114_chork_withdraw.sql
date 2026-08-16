-- ────────────────────────────────────────────────────────────────
-- Taking your own challenge back
-- ────────────────────────────────────────────────────────────────
--
-- Found by playing a game rather than by reading the SQL: the pen
-- left you the instant you set a route.
--
-- 113 read an unsent challenge as a failed one, which is right for a
-- finished round and wrong for one in progress — every route is
-- unsent for the minute between putting it up and pulling on it. So
-- you tapped +, added a route, and the pen (and the add button gated
-- on it) moved to the next climber while you were still tying in.
--
-- The missing state is the setter who tries their own set and can't
-- do it. `chork_concede` refused them outright — "You set this one" —
-- on the assumption that a setter always succeeds. They didn't have a
-- way to end their own turn, so the rule had to guess, and it guessed
-- immediately.
--
-- ── Withdrawn, not deleted ──────────────────────────────────────
--
-- A challenge nobody set cleanly is not a round: it costs nobody a
-- letter and it should leave the wall. The obvious move is to delete
-- the row — but the pen is DERIVED from the routes, so deleting the
-- only evidence that you had a go hands the pen straight back to you.
--
-- So it is a withdrawal, not a delete. The route stops being a round
-- and stops being climbable, and the row stays as the record of whose
-- go it was. Still nothing new stored about the pen itself: it is
-- read off the routes exactly as before, and this is one more fact
-- about a route.

alter table public.routes
  add column if not exists withdrawn_at timestamptz;

comment on column public.routes.withdrawn_at is
  'Chork: the setter put this up and could not send it, so it never '
  'became a round. Kept rather than deleted because the pen is '
  'derived from the routes — deleting the evidence of a turn hands '
  'the pen back to the climber who just gave it up.';

-- Partial: only Chork withdraws, so the index stays tiny.
create index if not exists routes_set_withdrawn_idx
  on public.routes (set_id, number desc)
  where withdrawn_at is not null;

-- ── 1. Give up on your own set ────────────────────────────────────

create or replace function public.chork_withdraw_route(p_route_id uuid)
returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_route public.routes;
  v_set public.sets;
  result public.routes;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_route from public.routes where id = p_route_id;
  if v_route.id is null then
    raise exception 'No such route' using errcode = 'P0002';
  end if;

  select * into v_set from public.sets
   where id = v_route.set_id
     and owner_kind = 'climber'
     and game_mode = 'chork'
     and status = 'live';
  if v_set.id is null then
    raise exception 'Not a live Chork match' using errcode = 'P0002';
  end if;

  -- Yours to take back, nobody else's.
  if v_route.added_by is distinct from caller_id then
    raise exception 'Only the setter can withdraw a challenge'
      using errcode = '42501';
  end if;

  if v_route.withdrawn_at is not null then
    raise exception 'Already withdrawn' using errcode = '22023';
  end if;

  -- You sent it, so it IS a round — other climbers may already have
  -- spent goes answering it, and taking it back would erase their
  -- letters. Withdrawal is only for a challenge that never landed.
  if exists (
    select 1 from public.route_logs l
    where l.route_id = p_route_id
      and l.user_id = v_route.added_by
      and l.completed
  ) then
    raise exception 'You sent this one — it is a round now'
      using errcode = '22023';
  end if;

  update public.routes
     set withdrawn_at = now(), updated_at = now()
   where id = p_route_id
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.chork_withdraw_route(uuid) from anon, public;
grant execute on function public.chork_withdraw_route(uuid) to authenticated;

-- ── 2. The pen, with the missing state ────────────────────────────
--
-- The rule is now the one the game actually has:
--
--   the pen belongs to whoever set the newest challenge
--   → they sent it, so they set again;
--   → they haven't sent it YET, so they are still on it;
--   → they withdrew it, so it passes to the next climber.
--
-- `was_sent` is gone. It was doing two jobs and getting the second
-- one wrong: distinguishing a round from a non-round (which the
-- `rounds` CTE already does on its own) and deciding the pen (which
-- is what withdrawal answers properly).

drop function if exists public.chork_standings(uuid);

create or replace function public.chork_standings(p_set_id uuid)
returns table (
  player_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_guest boolean,
  letters smallint,
  is_out boolean,
  has_left boolean,
  has_pen boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with rounds as (
    -- A round is a route its setter has SENT and not taken back.
    select
      r.id as route_id,
      r.added_by as setter_id,
      coalesce(r.declared_grade, r.community_grade) as grade,
      sl.attempts as setter_attempts
    from public.routes r
    join public.route_logs sl
      on sl.route_id = r.id
     and sl.user_id = r.added_by
     and sl.completed
    where r.set_id = p_set_id
      and r.added_by is not null
      and r.withdrawn_at is null
  ),
  answers as (
    select
      sp.id as seat_id,
      public.chork_is_letter(
        coalesce(pl.attempts, 0),
        coalesce(pl.completed, false),
        public.chork_allowance(rd.setter_attempts, rd.grade, sp.ceiling)
      ) as took_letter
    from public.set_players sp
    cross join rounds rd
    left join public.route_logs pl
      on pl.route_id = rd.route_id
     and (
       (sp.user_id is not null and pl.user_id = sp.user_id)
       or
       (sp.user_id is null and pl.player_id = sp.id)
     )
    where sp.set_id = p_set_id
      and sp.user_id is distinct from rd.setter_id
  ),
  tally as (
    select
      sp.id as seat_id,
      least(coalesce(sum(case when a.took_letter then 1 else 0 end), 0), 5)::smallint
        as letters
    from public.set_players sp
    left join answers a on a.seat_id = sp.id
    where sp.set_id = p_set_id
    group by sp.id
  ),
  -- The newest challenge PUT UP, sent or not, withdrawn or not — all
  -- three states decide the pen, so none can be filtered out here.
  last_set as (
    select r.added_by as setter_id,
           (r.withdrawn_at is not null) as was_withdrawn
    from public.routes r
    where r.set_id = p_set_id and r.added_by is not null
    order by r.number desc
    limit 1
  ),
  -- Seats still in the game, in rotation order.
  eligible as (
    select sp.id, sp.user_id, sp.joined_at,
           row_number() over (order by sp.joined_at) as seat_no
    from public.set_players sp
    join tally t on t.seat_id = sp.id
    where sp.set_id = p_set_id
      and sp.left_at is null
      and t.letters < 5
  ),
  pen as (
    select case
      -- Nothing set yet: the first seat opens.
      when not exists (select 1 from last_set)
        then (select id from eligible order by seat_no limit 1)
      -- Still theirs — sent, or still working on it — as long as
      -- they're in.
      when not (select was_withdrawn from last_set)
        and exists (
          select 1 from eligible e
          where e.user_id = (select setter_id from last_set)
        )
        then (select e.id from eligible e
              where e.user_id = (select setter_id from last_set))
      -- Withdrawn, or they went out holding it: the next eligible
      -- seat after them, wrapping.
      else coalesce(
        (select e.id from eligible e
          where e.joined_at > (
            select sp.joined_at from public.set_players sp
            where sp.set_id = p_set_id
              and sp.user_id = (select setter_id from last_set)
          )
          order by e.joined_at limit 1),
        (select id from eligible order by seat_no limit 1)
      )
    end as seat_id
  )
  select
    sp.id,
    sp.user_id,
    p.username,
    coalesce(p.name, sp.display_name),
    p.avatar_url,
    (sp.user_id is null),
    t.letters,
    (t.letters >= 5),
    (sp.left_at is not null),
    (sp.id = (select seat_id from pen))
  from public.set_players sp
  join tally t on t.seat_id = sp.id
  left join public.profiles p on p.id = sp.user_id
  where sp.set_id = p_set_id
  order by (t.letters >= 5), t.letters, sp.joined_at;
$$;

revoke execute on function public.chork_standings(uuid) from anon, public;
grant execute on function public.chork_standings(uuid) to authenticated, service_role;
