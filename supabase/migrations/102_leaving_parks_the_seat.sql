-- ────────────────────────────────────────────────────────────────
-- Leaving a Match parks your seat. It does not erase you.
-- ────────────────────────────────────────────────────────────────
--
-- `leaveMatchAction` has existed and been tested since the Match
-- shipped, with no UI to call it. Wiring one up exposed that the read
-- path was never designed for a parked seat:
--
--   • `match_standings` filters `left_at is null`, so leaving deletes
--     you AND your points from the board — including from the final
--     result your mates already watched you earn.
--   • `get_match_leaderboard` and `get_match_state_for_user` gate the
--     *viewer* the same way, so leaving also revokes your access to
--     the result you were part of.
--
-- Both are the mistake CLAUDE.md already records for gyms: "Leaving a
-- gym parks it, never severs it… dropping the membership would make
-- the climber's own history at that gym unreadable to them." A Match
-- is the same shape and needs the same answer.
--
-- ── The seam ────────────────────────────────────────────────────
--
-- One helper was doing two jobs. `is_set_player` gates six policies
-- and four functions — some of them reads, some writes — and its
-- `left_at is null` was right for exactly one of those halves.
--
--   is_set_player         you have a seat, or ever did   → READS
--   is_active_set_player  your seat is not parked        → WRITES
--
-- So a departed climber can still read the Match they were in, and
-- can no longer log into it. That is the gym rule, said in one place
-- instead of ten.

-- ── 1. The write gate, under its own name ─────────────────────────
--
-- Same body `is_set_player` had. Created FIRST, so that every write
-- call site below is already pointing at it before the read gate is
-- relaxed underneath them — at no point in this migration is a write
-- reachable by someone who left.

create or replace function public.is_active_set_player(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.set_players
    where set_id = p_set_id
      and user_id = (select auth.uid())
      and left_at is null
  );
$$;

comment on function public.is_active_set_player(uuid) is
  'Caller holds an unparked seat in this Match. The WRITE gate — '
  'logging, adding routes, ending. Reads use is_set_player.';

revoke execute on function public.is_active_set_player(uuid) from anon, public;
grant execute on function public.is_active_set_player(uuid) to authenticated;

-- ── 2. Repoint every write to it ──────────────────────────────────
--
-- Policy names are reproduced EXACTLY. A policy recreated under a
-- different spelling would leave the original in place, and permissive
-- policies OR together — the old, laxer one would still admit
-- everything. (This bit us in migration 087; it is written down here
-- so it doesn't bite a third time.)

-- route_logs INSERT: own log in a live set, or a guest's if you host.
drop policy if exists "Users can insert own route logs in active sets" on public.route_logs;
create policy "Users can insert own route logs in active sets"
on public.route_logs for insert to authenticated
with check (
  exists (
    select 1
    from public.routes r
    join public.sets s on s.id = r.set_id
    where r.id = route_logs.route_id
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
              and public.is_active_set_player(s.id))
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

-- route_logs UPDATE. Note the policy name: it is "…their own…".
-- Both halves matter — `using` decides which rows you may target,
-- `with check` decides what they may become. Migration 087 added the
-- `with check`; dropping it here by accident would reopen gym_id
-- forging.
drop policy if exists "Users can update their own route logs" on public.route_logs;
create policy "Users can update their own route logs"
on public.route_logs for update to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.sets s
    join public.set_players sp on sp.id = route_logs.player_id
    where s.id = route_logs.set_id
      and sp.set_id = s.id
      and sp.user_id is null
      and s.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.routes r
    join public.sets s on s.id = r.set_id
    where r.id = route_logs.route_id
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
              and public.is_active_set_player(s.id))
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

-- routes: adding and editing routes in a Match you are still in.
drop policy if exists "set_routes_insert_by_player" on public.routes;
create policy "set_routes_insert_by_player"
on public.routes for insert to authenticated
with check (
  exists (
    select 1 from public.sets s
    where s.id = routes.set_id
      and s.owner_kind = 'climber'
      and s.status = 'live'
      and public.is_active_set_player(s.id)
  )
);

drop policy if exists "set_routes_update_by_player" on public.routes;
create policy "set_routes_update_by_player"
on public.routes for update to authenticated
using (
  exists (
    select 1 from public.sets s
    where s.id = routes.set_id
      and s.owner_kind = 'climber'
      and s.status = 'live'
      and public.is_active_set_player(s.id)
  )
)
with check (
  exists (
    select 1 from public.sets s
    where s.id = routes.set_id
      and s.owner_kind = 'climber'
      and s.status = 'live'
      and public.is_active_set_player(s.id)
  )
);

-- ── 3. Now relax the read gate ────────────────────────────────────
--
-- Only after every write above names `is_active_set_player`.
--
-- `can_read_set` delegates to this and so is relaxed with it — which
-- is what we want: the `sets` row of a Match you left stays readable,
-- otherwise the summary 404s for the one person who most wants it.

create or replace function public.is_set_player(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.set_players
    where set_id = p_set_id
      and user_id = (select auth.uid())
  );
$$;

comment on function public.is_set_player(uuid) is
  'Caller holds a seat in this Match, parked or not. The READ gate. '
  'Deliberately ignores left_at: route_logs SELECT hangs off this, so '
  'a stricter test would make a climber''s own history in a Match they '
  'left unreadable to them — the same trap gym memberships avoid. '
  'Writes use is_active_set_player.';

-- ── 4. Leavers stay in the standings ──────────────────────────────
--
-- The row filter, and the reason this migration exists. `has_left` is
-- returned rather than inferred so the UI can mark the row instead of
-- silently ranking a ghost.

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
  rank smallint,
  has_left boolean
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
$$;

revoke execute on function public.match_standings(uuid) from anon, public;
grant execute on function public.match_standings(uuid) to authenticated, service_role;

-- ── 5. Carry the flag out to the board ────────────────────────────

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
  rank smallint,
  has_left boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  -- No `left_at is null` on the viewer either. You were in this
  -- Match; you may read how it went. Writing is gated separately, by
  -- is_active_set_player.
  if not exists (
    select 1 from public.set_players sp
    where sp.set_id = p_set_id
      and sp.user_id = v_viewer
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
    -- Unchanged by any of the above — leaving does not expose you.
    case when st.user_id = v_viewer then st.attempts else 0::smallint end as attempts,
    st.last_send_at,
    st.rank,
    st.has_left
  from public.match_standings(p_set_id) st
  join public.set_players sp on sp.id = st.player_id
  left join public.profiles p on p.id = st.user_id;
end;
$$;

revoke execute on function public.get_match_leaderboard(uuid, uuid) from anon, public;
grant execute on function public.get_match_leaderboard(uuid, uuid) to authenticated, service_role;

-- ── 6. …and out to the live screen ────────────────────────────────
--
-- Players gain `has_left` so the roster can grey a parked seat, and
-- the viewer gate matches the board's. The live screen still refuses
-- to let a leaver log — that is RLS's job, not this function's.

create or replace function public.get_match_state_for_user(p_set_id uuid, p_user_id uuid)
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
          'ceiling', sp.ceiling,
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
$$;

revoke execute on function public.get_match_state_for_user(uuid, uuid) from anon, public;
grant execute on function public.get_match_state_for_user(uuid, uuid) to service_role;

-- ── 7. The end-of-match signal ────────────────────────────────────
--
-- When the host ends it, everyone else's open screen should move to
-- the result rather than sit on a board that silently refuses writes.
-- The status change is already written to `sets`; it just wasn't
-- being published, so no client could hear it.
--
-- Realtime still applies RLS, and `sets` SELECT is `is_set_player` —
-- so a subscriber only ever receives Matches they are in. Clients
-- filter to `id=eq.<matchId>` on top of that.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sets'
  ) then
    alter publication supabase_realtime add table public.sets;
  end if;
end $$;
