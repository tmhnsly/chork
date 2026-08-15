-- ────────────────────────────────────────────────────────────────
-- The board reads the handicap
-- ────────────────────────────────────────────────────────────────
--
-- Migration 098 defined the rule and the columns. This is what makes
-- them count: `match_standings` applies the multiplier when the Match
-- has `handicap` on, and ranks by the result.
--
-- ── Why points come back in tenths ───────────────────────────────
--
-- A handicapped send is worth a fraction of its base points, so the
-- total stops being a whole number. Rather than round each send —
-- which would make a 0.4 warm-up and a 0.4 near-limit send both
-- vanish, and let rounding decide a close Match — every total is
-- carried in TENTHS as an integer. Exact sums, no float drift, and
-- the display divides by ten.
--
-- `points` is kept alongside as the BASE integer, unchanged. When the
-- handicap is off the two agree exactly (`points_tenths = points *
-- 10`), so ranking by tenths is one code path for both modes rather
-- than a branch.

-- ── 1. Standings ──────────────────────────────────────────────────

drop function if exists public.match_standings(uuid);

create or replace function public.match_standings(p_set_id uuid)
returns table (
  player_id uuid,
  user_id uuid,
  sends smallint,
  flashes smallint,
  zones smallint,
  points smallint,
  points_tenths integer,
  attempts smallint,
  last_send_at timestamptz,
  rank smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select handicap from public.sets where id = p_set_id
  ),
  agg as (
    select
      sp.id as seat_id,
      sp.user_id as account_id,
      coalesce(sum(case when rl.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when rl.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone))::smallint, 0::smallint) as points,
      coalesce(sum(
        case when (select handicap from cfg) then
          public.handicap_points_tenths(
            rl.attempts, rl.completed, rl.zone,
            -- What the adder declared, else what climbers voted —
            -- same resolution the grade pyramid uses.
            coalesce(r.declared_grade, r.community_grade),
            sp.ceiling
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
      and sp.left_at is null
    group by sp.id, sp.user_id
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
    -- Ranks on the handicapped total, which equals the base total ×10
    -- when the handicap is off — so this is one clause for both modes.
    (dense_rank() over (
      order by a.points_tenths desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last
    ))::smallint
  from agg a;
$$;

revoke execute on function public.match_standings(uuid) from anon, authenticated, public;

-- ── 2. The live board ─────────────────────────────────────────────

drop function if exists public.get_match_leaderboard(uuid, uuid);

create or replace function public.get_match_leaderboard(
  p_set_id uuid,
  p_viewer_id uuid default null
)
returns table (
  player_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_guest boolean,
  sends smallint,
  flashes smallint,
  zones smallint,
  points smallint,
  points_tenths integer,
  attempts smallint,
  last_send_at timestamptz,
  rank smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- RETURNS TABLE puts `user_id`, `points`, `attempts` … in scope as
-- variables. Every reference below is qualified, but say so
-- explicitly rather than rely on it staying that way.
#variable_conflict use_column
declare
  v_viewer uuid;
begin
  v_viewer := case
    when (select auth.uid()) is not null then (select auth.uid())
    else p_viewer_id
  end;

  if v_viewer is null then
    return;
  end if;

  if not exists (
    select 1 from public.set_players sp
    where sp.set_id = p_set_id
      and sp.user_id = v_viewer
      and sp.left_at is null
  ) then
    return;
  end if;

  return query
  select
    st.player_id,
    st.user_id,
    p.username,
    coalesce(p.name, sp.display_name) as display_name,
    p.avatar_url,
    (sp.user_id is null) as is_guest,
    st.sends,
    st.flashes,
    st.zones,
    st.points,
    st.points_tenths,
    -- Privacy: own attempts pass through, everyone else's read 0.
    -- A guest's always read 0 — no account owns them; the host reads
    -- them from `guest_logs`. See CONTEXT.md "Attempt privacy".
    case when st.user_id = v_viewer then st.attempts else 0::smallint end as attempts,
    st.last_send_at,
    st.rank
  from public.match_standings(p_set_id) st
  join public.set_players sp on sp.id = st.player_id
  left join public.profiles p on p.id = st.user_id;
end;
$$;

grant execute on function public.get_match_leaderboard(uuid, uuid) to authenticated;
revoke execute on function public.get_match_leaderboard(uuid, uuid) from anon, public;

-- ── 3. The room bundle ────────────────────────────────────────────

create or replace function public.get_match_state_for_user(
  p_set_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      and left_at is null
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
          -- Needed client-side so the live board can recompute the
          -- handicap between realtime events without another fetch.
          'ceiling', sp.ceiling
        )
        order by sp.joined_at
      )
      from public.set_players sp
      left join public.profiles p on p.id = sp.user_id
      where sp.set_id = p_set_id
        and sp.left_at is null
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
          'rank', lb.rank
        )
        order by lb.rank
      )
      from public.get_match_leaderboard(p_set_id, p_user_id) lb
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_match_state_for_user(uuid, uuid) from anon, authenticated, public;
grant execute on function public.get_match_state_for_user(uuid, uuid) to service_role;

-- ── 4. History and the public card ────────────────────────────────
--
-- Both read `match_standings`, so both follow it into tenths. A
-- finished handicapped Match has to show the score it was won on.

-- Return type changes (two new columns), and `create or replace`
-- can't alter an OUT-parameter row type.
drop function if exists public.get_match_history(uuid, integer, timestamptz);

create or replace function public.get_match_history(
  p_user_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  set_id uuid,
  name text,
  location text,
  ended_at timestamptz,
  started_at timestamptz,
  duration_seconds integer,
  player_count smallint,
  handicap boolean,
  user_rank smallint,
  user_sends smallint,
  user_flashes smallint,
  user_points smallint,
  user_points_tenths integer,
  user_is_winner boolean,
  winner_user_id uuid,
  winner_username text,
  winner_display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select s.id, s.name, s.location, s.starts_at, s.ends_at, s.handicap
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id and sp.user_id = p_user_id and sp.left_at is null
    where s.owner_kind = 'climber'
      and s.status = 'archived'
      and s.ends_at is not null
      and (p_before is null or s.ends_at < p_before)
    order by s.ends_at desc
    limit least(coalesce(p_limit, 20), 100)
  ),
  standings as (
    select m.id as set_id, st.*
    from mine m
    cross join lateral public.match_standings(m.id) st
  ),
  winner as (
    select distinct on (sd.set_id)
      sd.set_id, sd.user_id, sd.player_id,
      coalesce(p.name, sp.display_name) as display_name,
      p.username
    from standings sd
    join public.set_players sp on sp.id = sd.player_id
    left join public.profiles p on p.id = sd.user_id
    where sd.rank = 1
    order by sd.set_id, sd.player_id
  )
  select
    m.id,
    m.name,
    m.location,
    m.ends_at,
    m.starts_at,
    greatest(extract(epoch from (m.ends_at - m.starts_at))::integer, 0),
    (select count(*)::smallint from public.set_players sp
      where sp.set_id = m.id and sp.left_at is null),
    m.handicap,
    mine_st.rank,
    mine_st.sends,
    mine_st.flashes,
    mine_st.points,
    mine_st.points_tenths,
    (mine_st.rank = 1),
    w.user_id,
    w.username,
    w.display_name
  from mine m
  join standings mine_st
    on mine_st.set_id = m.id and mine_st.user_id = p_user_id
  left join winner w on w.set_id = m.id
  order by m.ends_at desc;
$$;

revoke execute on function public.get_match_history(uuid, integer, timestamptz) from anon, authenticated, public;
grant execute on function public.get_match_history(uuid, integer, timestamptz) to service_role;

create or replace function public.get_public_match_result(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  set_row public.sets;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,64}$' then
    return null;
  end if;

  select * into set_row
  from public.sets
  where share_token = p_token
    and owner_kind = 'climber';

  if set_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'set_id', set_row.id,
    'name', set_row.name,
    'location', set_row.location,
    'started_at', set_row.starts_at,
    'ended_at', set_row.ends_at,
    'status', set_row.status,
    'handicap', set_row.handicap,
    'player_count', (
      select count(*) from public.set_players sp
      where sp.set_id = set_row.id and sp.left_at is null
    ),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rank', st.rank,
          'display_name', coalesce(p.name, sp.display_name),
          'username', p.username,
          'is_guest', (sp.user_id is null),
          'points', st.points,
          'points_tenths', st.points_tenths,
          'sends', st.sends,
          'flashes', st.flashes,
          'zones', st.zones,
          'is_winner', (st.rank = 1)
          -- `attempts` is deliberately absent. Do not add it.
        )
        order by st.rank, coalesce(p.username, sp.display_name)
      )
      from public.match_standings(set_row.id) st
      join public.set_players sp on sp.id = st.player_id
      left join public.profiles p on p.id = st.user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_public_match_result(text) from anon, authenticated, public;
grant execute on function public.get_public_match_result(text) to service_role;
