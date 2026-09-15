-- ────────────────────────────────────────────────────────────────
-- Deleting and hiding games
-- ────────────────────────────────────────────────────────────────
--
-- Spec: docs/superpowers/specs/2026-09-15-delete-and-hide-games-design.md
--
-- Tom, after testing at Yonder: there was no way to delete a game made by
-- accident, or to take one off your lists. Two actions, two reaches:
--
--   • delete_match: the host deletes a game for everyone. The set goes,
--     its seats, routes, logs and grade ladder cascade with it, and its
--     pending invites are deleted. Badges already earned stay:
--     user_achievements has no link to a game.
--   • set_match_hidden: any player takes a finished game off their own
--     lists, or puts it back.
--
-- Hides live in their own table, not on `set_players`: every player of a
-- game can read all of its seat rows (`set_players_select` is
-- `can_read_set`), so a column there would show your hide to them. Like
-- `leagues`, `hidden_matches` has no Data API grant. History and badge
-- context skip a game its subject hid, and the state bundle carries
-- `viewer_hidden`, the viewer's own flag.

create table public.hidden_matches (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  set_id    uuid not null references public.sets(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, set_id)
);
comment on table public.hidden_matches is
  'Finished games a player took off their own lists (migration 141). '
  'Read and written only through SECURITY DEFINER functions — deliberately NO Data API grant.';

-- The primary key leads with user_id; deleting a set scans by set_id.
create index hidden_matches_set_id_idx on public.hidden_matches (set_id);

alter table public.hidden_matches enable row level security;
revoke all on public.hidden_matches from anon, authenticated;

-- ── delete_match ──────────────────────────────────────────────────

create or replace function public.delete_match(p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.sets;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into target
    from public.sets
   where id = p_set_id
     and owner_kind = 'climber'
   for update;

  -- A non-player and a missing game get the same answer, so an id can't
  -- be probed.
  if target.id is null
     or not exists (
       select 1 from public.set_players sp
        where sp.set_id = p_set_id
          and sp.user_id = caller_id
     ) then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  if target.host_id is distinct from caller_id then
    raise exception 'Only the host can delete this game' using errcode = '42501';
  end if;

  -- A league week leaves its league first: a finished week holds
  -- placings, and the week count decides everyone's drops (134). A live
  -- week with no routes is the accidental one-tap start and counts for
  -- nothing yet, so it can go directly.
  if target.league_id is not null
     and not (
       target.status = 'live'
       and not exists (select 1 from public.routes r where r.set_id = p_set_id)
     ) then
    raise exception 'Remove this week from its league before deleting it'
      using errcode = '22023';
  end if;

  -- An invite to a game that no longer exists would open a dead join.
  delete from public.notifications
   where kind = 'match_invite_received'
     and payload ->> 'set_id' = p_set_id::text;

  delete from public.sets where id = p_set_id;

  return p_set_id;
end;
$$;

revoke execute on function public.delete_match(uuid) from anon, public;
grant execute on function public.delete_match(uuid) to authenticated;

-- ── set_match_hidden ──────────────────────────────────────────────

create or replace function public.set_match_hidden(p_set_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_status text;
  hide boolean := coalesce(p_hidden, false);
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select s.status into v_status
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id
     and sp.user_id = caller_id
   where s.id = p_set_id
     and s.owner_kind = 'climber';

  if v_status is null then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  if hide and v_status <> 'archived' then
    raise exception 'Only a finished game can be removed from your games'
      using errcode = '22023';
  end if;

  if hide then
    insert into public.hidden_matches (user_id, set_id)
    values (caller_id, p_set_id)
    on conflict (user_id, set_id) do nothing;
  else
    delete from public.hidden_matches
     where user_id = caller_id
       and set_id = p_set_id;
  end if;

  return hide;
end;
$$;

revoke execute on function public.set_match_hidden(uuid, boolean) from anon, public;
grant execute on function public.set_match_hidden(uuid, boolean) to authenticated;

-- ── get_match_history: skips games the subject hid ──────────────

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
      -- Taken off their own games (migration 141).
      and not exists (
        select 1 from public.hidden_matches hm
        where hm.set_id = s.id and hm.user_id = p_user_id
      )
      and (p_before is null or s.ends_at < p_before)
      -- An ended lobby that never had a route isn't a game.
      and exists (select 1 from public.routes r where r.set_id = s.id)
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

-- ── get_match_achievement_context: skips games the subject hid ───

create or replace function public.get_match_achievement_context(p_user_id uuid)
returns table (
  matches_played bigint,
  matches_won bigint,
  matches_hosted bigint,
  max_players_in_won_match bigint,
  unique_coplayers bigint,
  max_iron_crew_pair_count bigint,
  match_total_flashes bigint,
  match_total_sends bigint,
  match_total_points bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with played as (
    select s.id, s.host_id
    from public.sets s
    join public.set_players sp
      on sp.set_id = s.id and sp.user_id = p_user_id and sp.left_at is null
    where s.owner_kind = 'climber'
      and s.status = 'archived'
      -- Taken off their own games (migration 141).
      and not exists (
        select 1 from public.hidden_matches hm
        where hm.set_id = s.id and hm.user_id = p_user_id
      )
  ),
  standings as (
    select pl.id as set_id, st.*
    from played pl
    cross join lateral public.match_standings(pl.id) st
  ),
  mine as (
    select sd.set_id, sd.rank, sd.sends, sd.flashes, sd.points
    from standings sd
    where sd.user_id = p_user_id
  ),
  won as (
    select m.set_id from mine m where m.rank = 1
  ),
  coplayers as (
    select sp.user_id, count(*) as together
    from played pl
    join public.set_players sp
      on sp.set_id = pl.id and sp.left_at is null
    where sp.user_id <> p_user_id
    group by sp.user_id
  )
  select
    (select count(*) from played),
    (select count(*) from won),
    (select count(*) from played where host_id = p_user_id),
    coalesce((
      select max(cnt) from (
        select count(*) as cnt
        from public.set_players sp
        where sp.set_id in (select set_id from won) and sp.left_at is null
        group by sp.set_id
      ) w
    ), 0),
    (select count(*) from coplayers),
    coalesce((select max(together) from coplayers), 0),
    coalesce((select sum(flashes) from mine), 0),
    coalesce((select sum(sends) from mine), 0),
    coalesce((select sum(points) from mine), 0);
$$;

revoke execute on function public.get_match_achievement_context(uuid) from anon, authenticated, public;
grant execute on function public.get_match_achievement_context(uuid) to service_role;

-- ── get_match_state_for_user: carries viewer_hidden ─────────────

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
    'other_logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rl.id,
          'set_id', rl.set_id,
          'route_id', rl.route_id,
          'user_id', rl.user_id,
          'player_id', rl.player_id,
          'attempts', case when not rl.completed then 0 when rl.attempts = 1 then 1 else 2 end,
          'completed', rl.completed,
          'completed_at', rl.completed_at,
          'zone', rl.zone,
          'created_at', rl.created_at,
          'updated_at', rl.updated_at
        )
      )
      from public.route_logs rl
      where rl.set_id = p_set_id
        and rl.user_id is distinct from p_user_id
        and not (is_host and rl.user_id is null)
    ), '[]'::jsonb),
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
    ), '[]'::jsonb),
    -- The viewer's own hide (migration 141). The bundle is built per
    -- viewer, so no other player's flag can ride along.
    'viewer_hidden', exists (
      select 1 from public.hidden_matches hm
      where hm.set_id = p_set_id and hm.user_id = p_user_id
    )
  );
end;
$$;
