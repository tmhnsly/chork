-- ────────────────────────────────────────────────────────────────
-- A climber has two limits on a mixed day
-- ────────────────────────────────────────────────────────────────
--
-- 117 let one Match run boulders and ropes. 118 made the honest
-- interim call for the handicap and the Chork allowance — an
-- off-family route reads as "limit unknown", so it scores flat and
-- buys no extra goes — because there was only ever one ceiling and it
-- belonged to the Match's own scale.
--
-- But a climber on a mixed day genuinely has two limits: V4 on the
-- boulders, 6b on the ropes. Under 118 they got credit for one of
-- them and climbed the other half of the session unhandicapped, which
-- is the thing the handicap exists to prevent.
--
-- So the ceiling gains its pair, named to match the scales it is
-- measured against: `ceiling` for the Match's own family,
-- `alt_ceiling` for the other. Null still means "no limit given",
-- which every reader already handles by not adjusting.

alter table public.set_players
  add column if not exists alt_ceiling smallint;

comment on column public.set_players.alt_ceiling is
  'The climber''s limit in the OTHER discipline family — the one '
  '`sets.alt_grading_scale` grades. Null on a single-discipline '
  'Match, and null means "not given", which scores flat.';

alter table public.set_players drop constraint if exists set_players_alt_ceiling_ck;
alter table public.set_players add constraint set_players_alt_ceiling_ck
  check (alt_ceiling is null or (alt_ceiling >= 0 and alt_ceiling <= 30));

-- ── Setting them ──────────────────────────────────────────────────
--
-- Both in one call: the sheet shows both pickers and saves once, and
-- two RPCs would let a climber's limits disagree with each other
-- halfway through a save. The 3-argument signature is dropped rather
-- than left as an overload — migration 101's lesson.

drop function if exists public.set_match_ceiling(uuid, uuid, smallint);

create or replace function public.set_match_ceiling(
  p_set_id uuid,
  p_player_id uuid,
  p_ceiling smallint default null,
  p_alt_ceiling smallint default null
)
returns public.set_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_host_id uuid;
  v_seat_user uuid;
  result public.set_players;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_ceiling is not null and (p_ceiling < 0 or p_ceiling > 30) then
    raise exception 'Ceiling out of range' using errcode = '22023';
  end if;

  if p_alt_ceiling is not null and (p_alt_ceiling < 0 or p_alt_ceiling > 30) then
    raise exception 'Ceiling out of range' using errcode = '22023';
  end if;

  select s.host_id into v_host_id
  from public.sets s
  where s.id = p_set_id and s.owner_kind = 'climber' and s.status = 'live';

  if v_host_id is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;

  select sp.user_id into v_seat_user
  from public.set_players sp
  where sp.id = p_player_id and sp.set_id = p_set_id and sp.left_at is null;

  if not found then
    raise exception 'That player isn''t in this match' using errcode = 'P0002';
  end if;

  -- Your own seat, or a guest's if you host.
  if v_seat_user is distinct from caller_id
     and not (v_seat_user is null and v_host_id = caller_id) then
    raise exception 'You can only set your own ceiling'
      using errcode = '42501';
  end if;

  update public.set_players
     set ceiling = p_ceiling,
         alt_ceiling = p_alt_ceiling
   where id = p_player_id
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.set_match_ceiling(uuid, uuid, smallint, smallint)
  from anon, public;
grant execute on function public.set_match_ceiling(uuid, uuid, smallint, smallint)
  to authenticated;

-- ── Every reader picks the ceiling for the route's own family ─────
--
-- Bodies regenerated from `pg_get_functiondef` with one expression
-- changed each, per migration 103.

CREATE OR REPLACE FUNCTION public.match_standings(p_set_id uuid)
 RETURNS TABLE(player_id uuid, user_id uuid, sends smallint, flashes smallint, zones smallint, points smallint, points_tenths integer, attempts smallint, last_send_at timestamp with time zone, rank smallint, has_left boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cfg as (
    select handicap, discipline from public.sets where id = p_set_id
  ),
  agg as (
    select
      sp.id as seat_id,
      sp.user_id as account_id,
      (sp.left_at is not null) as departed,
      coalesce(sum(case when rl.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when rl.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone))::smallint, 0::smallint) as points,
      coalesce(sum(
        case when (select handicap from cfg) then
          public.handicap_points_tenths(
            rl.attempts, rl.completed, rl.zone,
            coalesce(r.declared_grade, r.community_grade),
            -- A ceiling is ONE number in ONE scale — the Match's own.
            -- On a mixed day (migration 117) an off-family route's
            -- ordinal is not comparable to it: a 6b rope and a V6
            -- boulder are both ordinal 6, so scoring the rope against
            -- a V4 ceiling reads as "two grades above your limit" on a
            -- scale the climber never gave a limit for. Unknown, so no
            -- adjustment — `handicap_points_tenths` already scores a
            -- null at full value.
            -- The ceiling for the family THIS route belongs to.
            -- 118 read an off-family route as "limit unknown" because
            -- there was only one ceiling; there are two now, so a
            -- climber on a mixed day gets credit for both limits.
            case
              when public.discipline_family(
                     coalesce(r.discipline, (select discipline from cfg)))
                 = public.discipline_family((select discipline from cfg))
              then sp.ceiling
              else sp.alt_ceiling
            end
          )
        else
          public.compute_points(rl.attempts, rl.completed, rl.zone) * 10
        end
      )::integer, 0) as points_tenths,
      coalesce(sum(rl.attempts)::smallint, 0::smallint) as attempts,
      max(rl.completed_at) as last_send_at
    from public.set_players sp
    left join public.route_logs rl
      on rl.set_id = sp.set_id
     and (
       (sp.user_id is not null and rl.user_id = sp.user_id)
       or
       (sp.user_id is null and rl.player_id = sp.id)
     )
    left join public.routes r on r.id = rl.route_id
    where sp.set_id = p_set_id
    -- No left_at filter. A parked seat keeps the points it earned;
    -- see the header. Ranking is unchanged, so a leaver who was
    -- winning is still shown winning — which is the honest result.
    group by sp.id, sp.user_id, sp.left_at
  )
  select
    a.seat_id,
    a.account_id,
    a.sends,
    a.flashes,
    a.zones,
    a.points,
    a.points_tenths,
    a.attempts,
    a.last_send_at,
    (dense_rank() over (
      order by a.points_tenths desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last
    ))::smallint,
    a.departed
  from agg a;
$function$
;


CREATE OR REPLACE FUNCTION public.chork_round_allowance(p_set_id uuid, p_route_id uuid, p_player_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  v_host uuid;
  v_seat public.set_players;
  v_setter public.set_players;
  v_setter_attempts integer;
  v_grade smallint;
  v_setter_seat uuid;
  v_same_family boolean;
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

  select r.added_by_player, coalesce(r.declared_grade, r.community_grade),
         coalesce(r.discipline, s.discipline) = s.discipline
           or public.discipline_family(coalesce(r.discipline, s.discipline))
              = public.discipline_family(s.discipline)
    into v_setter_seat, v_grade, v_same_family
  from public.routes r
  join public.sets s on s.id = r.set_id
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

  -- The ceiling is stated in the Match's own scale, so it says nothing
  -- about a route from the other family (migration 118). Unknown buys
  -- no bonus, exactly as an ungraded route does.
  return public.chork_allowance(
    v_setter_attempts,
    v_grade,
    case when v_same_family then v_seat.ceiling else v_seat.alt_ceiling end
  );
end;
$function$
;


drop function if exists public.chork_standings(uuid);

CREATE OR REPLACE FUNCTION public.chork_standings(p_set_id uuid)
 RETURNS TABLE(player_id uuid, user_id uuid, username text, display_name text, avatar_url text, is_guest boolean, letters smallint, is_out boolean, has_left boolean, has_pen boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with rounds as (
    -- A round is a route whose SETTER sent it and has not taken it
    -- back. The setter's own send is matched on their seat, so a
    -- guest's counts exactly like an account's.
    select
      r.id as route_id,
      r.added_by_player as setter_seat,
      coalesce(r.declared_grade, r.community_grade) as grade,
      r.discipline as discipline,
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
        -- The ceiling is stated in the Match's own scale, so it says
        -- nothing about a route from the other family (migration 118).
        -- Unknown buys no bonus, exactly as an ungraded route does.
        public.chork_allowance(
          rd.setter_attempts,
          rd.grade,
          case
            when public.discipline_family(
                   coalesce(rd.discipline, m.discipline))
               = public.discipline_family(m.discipline)
            then sp.ceiling
            else sp.alt_ceiling
          end
        )
      ) as took_letter
    from public.set_players sp
    cross join rounds rd
    cross join (select discipline from public.sets where id = p_set_id) m
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
$function$
;


CREATE OR REPLACE FUNCTION public.get_match_state_for_user(p_set_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  set_row public.sets;
  is_host boolean;
begin
  if p_user_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.set_players
    where set_id = p_set_id
      and user_id = p_user_id
  ) then
    return null;
  end if;

  select * into set_row from public.sets where id = p_set_id;
  if set_row.id is null or set_row.owner_kind <> 'climber' then
    return null;
  end if;

  is_host := (set_row.host_id = p_user_id);

  return jsonb_build_object(
    'match', to_jsonb(set_row),
    'grades', coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', ordinal, 'label', label)
        order by ordinal
      )
      from public.set_grades
      where set_id = p_set_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.number)
      from public.routes r
      where r.set_id = p_set_id
        -- A challenge its setter took back never became a round, so
        -- it is not part of the match: not on the grid, not loggable.
        -- The row survives only because the Chork pen is derived from
        -- the routes and needs the record of whose go it was.
        and r.withdrawn_at is null
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', sp.id,
          'user_id', sp.user_id,
          'is_guest', (sp.user_id is null),
          'username', p.username,
          'display_name', coalesce(p.name, sp.display_name),
          'avatar_url', p.avatar_url,
          'joined_at', sp.joined_at,
          'is_host', sp.is_host,
          'ceiling', sp.ceiling,
          'alt_ceiling', sp.alt_ceiling,
          'has_left', (sp.left_at is not null)
        )
        -- Parked seats sort last, then by join order, so the roster
        -- reads as "who is here" before "who was".
        order by (sp.left_at is not null), sp.joined_at
      )
      from public.set_players sp
      left join public.profiles p on p.id = sp.user_id
      where sp.set_id = p_set_id
    ), '[]'::jsonb),
    'my_logs', coalesce((
      select jsonb_agg(to_jsonb(rl))
      from public.route_logs rl
      where rl.set_id = p_set_id
        and rl.user_id = p_user_id
    ), '[]'::jsonb),
    'guest_logs', case when is_host then coalesce((
      select jsonb_agg(to_jsonb(rl))
      from public.route_logs rl
      join public.set_players sp on sp.id = rl.player_id
      where rl.set_id = p_set_id
        and sp.user_id is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'leaderboard', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', lb.player_id,
          'user_id', lb.user_id,
          'username', lb.username,
          'display_name', lb.display_name,
          'avatar_url', lb.avatar_url,
          'is_guest', lb.is_guest,
          'sends', lb.sends,
          'flashes', lb.flashes,
          'zones', lb.zones,
          'points', lb.points,
          'points_tenths', lb.points_tenths,
          'attempts', lb.attempts,
          'last_send_at', lb.last_send_at,
          'rank', lb.rank,
          'has_left', lb.has_left
        )
        order by lb.rank
      )
      from public.get_match_leaderboard(p_set_id, p_user_id) lb
    ), '[]'::jsonb)
  );
end;
$function$
;

revoke execute on function public.chork_standings(uuid) from anon, public;
grant execute on function public.chork_standings(uuid) to authenticated, service_role;
