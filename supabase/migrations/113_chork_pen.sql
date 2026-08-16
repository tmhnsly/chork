-- ────────────────────────────────────────────────────────────────
-- Whose pen is it — worked out where the numbers are
-- ────────────────────────────────────────────────────────────────
--
-- The pen was computed client-side and was wrong twice over.
--
-- It needed to know whether the setter had SENT their own challenge,
-- which is their attempt count, which is private to them. A viewer
-- who wasn't the setter saw every round as unsent, so the rule
-- treated each one as a failed set and rotated the pen to the wrong
-- climber.
--
-- And it compared `routes.added_by` — a user id — against a list of
-- SEAT ids, so the lookup never matched even for the setter. A guest
-- has a seat and no user id at all; the two identifiers are not
-- interchangeable and this is the third place that has bitten.
--
-- Everything else about Chork already lives here for the same reason.
-- The pen now does too.
--
-- ── The rule ────────────────────────────────────────────────────
--
-- The setter keeps the pen while they keep sending their own
-- challenges. It passes when they fail to send one — and a challenge
-- nobody set cleanly is not a round, so it costs nobody a letter.
-- Climbers who are out are skipped: five letters means you don't set
-- either. Rotation is seating order, which is `joined_at`.

-- Adding an OUT column changes the row type, which `create or
-- replace` refuses. Dropped explicitly rather than left to fail on
-- deploy.
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
  -- The most recent challenge PUT UP, sent or not — an unsent one is
  -- exactly what passes the pen, so it can't be filtered out here.
  last_set as (
    select
      r.added_by as setter_id,
      exists (
        select 1 from public.route_logs sl
        where sl.route_id = r.id and sl.user_id = r.added_by and sl.completed
      ) as was_sent
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
      -- They sent it and are still in, so they set again.
      when (select was_sent from last_set)
        and exists (
          select 1 from eligible e
          where e.user_id = (select setter_id from last_set)
        )
        then (select e.id from eligible e
              where e.user_id = (select setter_id from last_set))
      -- Failed their own set, or went out holding it: the next
      -- eligible seat after them, wrapping.
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
