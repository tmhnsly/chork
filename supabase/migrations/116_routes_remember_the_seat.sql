-- ────────────────────────────────────────────────────────────────
-- A route remembers which SEAT set it
-- ────────────────────────────────────────────────────────────────
--
-- Found by playing Chork with a guest: the pen reached Dave and
-- bounced straight back.
--
-- `routes.added_by` is a user id. A guest hasn't got one. So when the
-- host puts a route up on a guest's behalf — the only way a guest can
-- do anything, since they have no session — the route records the
-- HOST as its setter. The pen is derived from the newest route's
-- setter, so it returned to the host immediately. In a match with one
-- guest, the host sets every single round and the guest never gets a
-- turn.
--
-- This is the same user-id-vs-seat-id collision for the fourth time
-- (102's standings, 113's pen, 112's log sheet, now this). The cure
-- is to stop translating between them: a match is played by SEATS,
-- so the route records the seat and Chork never looks at a user id
-- again.
--
-- `route_logs` already learned this lesson — it carries `user_id` and
-- `player_id` side by side. `routes` now does the same.

alter table public.routes
  add column if not exists added_by_player uuid
    references public.set_players(id) on delete set null;

comment on column public.routes.added_by_player is
  'The SEAT that set this route. Match routes only. `added_by` is the '
  'account behind that seat and is null for a guest, which is exactly '
  'why this column exists — Chork rotates the pen by seat.';

create index if not exists routes_added_by_player_idx
  on public.routes (added_by_player)
  where added_by_player is not null;

-- Backfill: every existing match route was set by an account, so its
-- seat is that account's seat in that match.
update public.routes r
   set added_by_player = sp.id
  from public.set_players sp
 where sp.set_id = r.set_id
   and sp.user_id = r.added_by
   and r.added_by is not null
   and r.added_by_player is null;

-- ── 1. Adding a route, for yourself or for a guest ────────────────
--
-- The old 5-argument signature is dropped rather than left alongside:
-- a defaulted 6th parameter creates an OVERLOAD, and leaving both is
-- how migration 101 ended up with a function that could not clear a
-- value because the wrong one kept resolving.

drop function if exists public.add_match_route(uuid, text, smallint, boolean, text);

create or replace function public.add_match_route(
  p_set_id uuid,
  p_description text default null,
  p_grade smallint default null,
  p_has_zone boolean default false,
  p_discipline text default null,
  p_player_id uuid default null
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
  set_discipline text;
  set_host uuid;
  v_seat public.set_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_discipline is not null
     and p_discipline not in ('boulder', 'sport', 'top-rope') then
    raise exception 'Invalid discipline' using errcode = '22023';
  end if;

  -- Was is_set_player, which migration 102 widened to include
  -- parked seats. Adding a route is a write.
  if not public.is_active_set_player(p_set_id) then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  select grading_scale, status, owner_kind, discipline, host_id
    into set_scale, set_status, set_kind, set_discipline, set_host
  from public.sets
  where id = p_set_id
  for update;

  if set_scale is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_kind <> 'climber' then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if set_status <> 'live' then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;

  -- Your own seat, or a guest's if you host — the same split as
  -- logging and conceding, and for the same reason: a guest has no
  -- session, so the host acts for them.
  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = p_set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = p_set_id and left_at is null;
    if v_seat.user_id is not null or set_host is distinct from caller_id then
      raise exception 'Only the host can act for a guest'
        using errcode = '42501';
    end if;
  end if;

  if v_seat.id is null then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  select coalesce(max(number), 0) + 1 into next_number
  from public.routes
  where set_id = p_set_id;

  insert into public.routes (
    set_id, number, description, declared_grade, has_zone,
    added_by, added_by_player, discipline
  ) values (
    p_set_id,
    next_number,
    nullif(trim(coalesce(p_description, '')), ''),
    case when set_scale = 'points' then null else p_grade end,
    coalesce(p_has_zone, false),
    -- The account, when there is one. Null for a guest — which is the
    -- whole point of the column beside it.
    v_seat.user_id,
    v_seat.id,
    -- Store only a genuine disagreement. Passing the Set's own
    -- discipline is normalised back to null so that changing the
    -- Set's default later still moves this route with it.
    case when p_discipline is null or p_discipline = set_discipline
         then null else p_discipline end
  )
  returning * into result;

  return result;
end;
$$;

revoke execute on function
  public.add_match_route(uuid, text, smallint, boolean, text, uuid)
  from anon, public;
grant execute on function
  public.add_match_route(uuid, text, smallint, boolean, text, uuid)
  to authenticated;

-- ── 2. Withdrawing, by seat ───────────────────────────────────────

create or replace function public.chork_withdraw_route(
  p_route_id uuid,
  p_player_id uuid default null
)
returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_route public.routes;
  v_set public.sets;
  v_seat public.set_players;
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

  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = v_route.set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = v_route.set_id and left_at is null;
    if v_seat.user_id is not null or v_set.host_id is distinct from caller_id then
      raise exception 'Only the host can act for a guest'
        using errcode = '42501';
    end if;
  end if;

  -- Yours to take back, nobody else's. Compared by SEAT — a guest's
  -- challenge belongs to their seat, and matching on the account
  -- would let the host withdraw it as if it were their own.
  if v_route.added_by_player is distinct from v_seat.id then
    raise exception 'Only the setter can withdraw a challenge'
      using errcode = '42501';
  end if;

  if v_route.withdrawn_at is not null then
    raise exception 'Already withdrawn' using errcode = '22023';
  end if;

  -- Sent, so it IS a round — other climbers may already have spent
  -- goes answering it, and taking it back would erase their letters.
  if exists (
    select 1 from public.route_logs l
    where l.route_id = p_route_id
      and l.completed
      and (
        (v_seat.user_id is not null and l.user_id = v_seat.user_id)
        or
        (v_seat.user_id is null and l.player_id = v_seat.id)
      )
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

drop function if exists public.chork_withdraw_route(uuid);
revoke execute on function public.chork_withdraw_route(uuid, uuid) from anon, public;
grant execute on function public.chork_withdraw_route(uuid, uuid) to authenticated;

-- ── 3. Chork, entirely in seats ───────────────────────────────────
--
-- Every user-id lookup is gone. The setter is a seat, the answerer is
-- a seat, the pen is a seat, and the rotation compares seat to seat.
-- That removes the translation step that has now produced four bugs.

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
    -- A round is a route whose SETTER sent it and has not taken it
    -- back. The setter's own send is matched on their seat, so a
    -- guest's counts exactly like an account's.
    select
      r.id as route_id,
      r.added_by_player as setter_seat,
      coalesce(r.declared_grade, r.community_grade) as grade,
      sl.attempts as setter_attempts
    from public.routes r
    join public.set_players ssp on ssp.id = r.added_by_player
    join public.route_logs sl
      on sl.route_id = r.id
     and sl.completed
     and (
       (ssp.user_id is not null and sl.user_id = ssp.user_id)
       or
       (ssp.user_id is null and sl.player_id = ssp.id)
     )
    where r.set_id = p_set_id
      and r.added_by_player is not null
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
      -- You don't answer your own challenge.
      and sp.id <> rd.setter_seat
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
  -- The newest challenge PUT UP — sent or not, withdrawn or not. All
  -- three states decide the pen, so none can be filtered out here.
  last_set as (
    select r.added_by_player as setter_seat,
           (r.withdrawn_at is not null) as was_withdrawn
    from public.routes r
    where r.set_id = p_set_id and r.added_by_player is not null
    order by r.number desc
    limit 1
  ),
  eligible as (
    select sp.id, sp.joined_at,
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
          where e.id = (select setter_seat from last_set)
        )
        then (select setter_seat from last_set)
      -- Withdrawn, or they went out holding it: the next eligible
      -- seat after them, wrapping.
      else coalesce(
        (select e.id from eligible e
          where e.joined_at > (
            select sp.joined_at from public.set_players sp
            where sp.id = (select setter_seat from last_set)
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

-- ── 4. Conceding, by seat ─────────────────────────────────────────
--
-- Same collision, same fix: "you set this one" compared the seat's
-- account against `routes.added_by`, so a guest could be made to
-- concede their own challenge and the host could not concede theirs.

create or replace function public.chork_concede(
  p_set_id uuid,
  p_route_id uuid,
  p_player_id uuid default null
)
returns public.route_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_allowance integer;
  v_seat public.set_players;
  v_host uuid;
  result public.route_logs;
begin
  -- Re-runs every authorisation check; it raises on anything the
  -- caller may not do.
  v_allowance := public.chork_round_allowance(p_set_id, p_route_id, p_player_id);

  if v_allowance is null then
    raise exception 'That challenge has not been set yet' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.sets
    where id = p_set_id and status = 'live'
  ) then
    raise exception 'Match is not live' using errcode = 'P0001';
  end if;

  select host_id into v_host from public.sets where id = p_set_id;

  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = p_set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = p_set_id and left_at is null;
  end if;

  -- You cannot concede your own challenge — you end that turn by
  -- withdrawing it. Compared by SEAT so it holds for a guest too.
  if exists (
    select 1 from public.routes r
    where r.id = p_route_id and r.added_by_player = v_seat.id
  ) then
    raise exception 'You set this one — take it back instead'
      using errcode = '22023';
  end if;

  if v_seat.user_id is not null then
    insert into public.route_logs (
      user_id, route_id, set_id, gym_id, attempts, completed, zone
    )
    values (v_seat.user_id, p_route_id, p_set_id, null, v_allowance, false, false)
    on conflict (user_id, route_id) do update
      -- `greatest` so conceding never REDUCES a count someone already
      -- logged past the allowance — that would hand back a letter
      -- they had already earned.
      set attempts = greatest(public.route_logs.attempts, v_allowance),
          completed = false,
          completed_at = null,
          updated_at = now()
    returning * into result;
  else
    insert into public.route_logs (
      player_id, user_id, route_id, set_id, gym_id, attempts, completed, zone
    )
    values (v_seat.id, null, p_route_id, p_set_id, null, v_allowance, false, false)
    on conflict (player_id, route_id) where player_id is not null do update
      set attempts = greatest(public.route_logs.attempts, v_allowance),
          completed = false,
          completed_at = null,
          updated_at = now()
    returning * into result;
  end if;

  return result;
end;
$$;

revoke execute on function public.chork_concede(uuid, uuid, uuid) from anon, public;
grant execute on function public.chork_concede(uuid, uuid, uuid) to authenticated;

-- ── 5. The allowance, by seat ─────────────────────────────────────
--
-- `chork_round_allowance` read the setter off `routes.added_by` and
-- looked for THEIR account's send — which for a guest's challenge is
-- null, so the round read as never set and nobody could answer it.

create or replace function public.chork_round_allowance(
  p_set_id uuid,
  p_route_id uuid,
  p_player_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_host uuid;
  v_seat public.set_players;
  v_setter public.set_players;
  v_setter_attempts integer;
  v_grade smallint;
  v_setter_seat uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select host_id into v_host
  from public.sets
  where id = p_set_id and owner_kind = 'climber' and game_mode = 'chork';

  if v_host is null then
    raise exception 'Not a Chork match' using errcode = 'P0002';
  end if;

  if p_player_id is null then
    select * into v_seat from public.set_players
     where set_id = p_set_id and user_id = caller_id and left_at is null;
  else
    select * into v_seat from public.set_players
     where id = p_player_id and set_id = p_set_id and left_at is null;
    if v_seat.user_id is not null or v_host is distinct from caller_id then
      raise exception 'Only the host can act for a guest' using errcode = '42501';
    end if;
  end if;

  if v_seat.id is null then
    raise exception 'Not a player in this match' using errcode = '42501';
  end if;

  select r.added_by_player, coalesce(r.declared_grade, r.community_grade)
    into v_setter_seat, v_grade
  from public.routes r
  where r.id = p_route_id and r.set_id = p_set_id and r.withdrawn_at is null;

  if v_setter_seat is null then
    raise exception 'Route not in this match' using errcode = 'P0002';
  end if;

  select * into v_setter from public.set_players where id = v_setter_seat;

  -- A challenge its setter hasn't sent isn't a round, so there is no
  -- allowance to hand out and nothing to concede.
  select sl.attempts into v_setter_attempts
  from public.route_logs sl
  where sl.route_id = p_route_id
    and sl.completed
    and (
      (v_setter.user_id is not null and sl.user_id = v_setter.user_id)
      or
      (v_setter.user_id is null and sl.player_id = v_setter.id)
    );

  if v_setter_attempts is null then
    return null;
  end if;

  return public.chork_allowance(v_setter_attempts, v_grade, v_seat.ceiling);
end;
$$;

revoke execute on function public.chork_round_allowance(uuid, uuid, uuid) from anon, public;
grant execute on function public.chork_round_allowance(uuid, uuid, uuid) to authenticated;
