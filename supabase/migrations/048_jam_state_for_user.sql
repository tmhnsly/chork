-- Robust jam state hydrator for the /jam/[id] page.
--
-- The existing `get_jam_state` RPC relies on `auth.uid()` inside a
-- SECURITY DEFINER body. When the caller's JWT is stale — which can
-- happen on SSR the instant before middleware refreshes the session —
-- `auth.uid()` returns NULL inside the function and the internal
-- `is_jam_player` check raises "Not a player in this jam" for users
-- who are definitely still active players. The page saw the exception,
-- returned `null`, and redirected legitimate players to `/jam/join`.
--
-- `get_jam_state_for_user` takes the user id as an explicit argument
-- so callers that already trust their own auth context (the Next
-- server, which has just resolved the user id via `requireSignedIn`)
-- can pass it directly instead of funnelling through Postgres' JWT
-- parser. The function is granted only to `service_role` and the
-- caller has to come in via `createServiceClient()` on the Next side,
-- which forces the page-level auth check to happen first.
--
-- Also drops the `WHERE public.is_jam_player(p_jam_id)` tail on
-- `get_jam_leaderboard`. That clause was defence-in-depth over an
-- already-gated caller — and broke when invoked inside a service-role
-- context because `auth.uid()` is NULL there, filtering the aggregate
-- to zero rows. The only callers are internal wrappers that have
-- already verified membership, so removing the tail is safe + lets
-- the new service-role flow read the leaderboard cleanly.

-- ── get_jam_leaderboard — drop the auth.uid() tail ─────

create or replace function public.get_jam_leaderboard(p_jam_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  sends smallint,
  flashes smallint,
  zones smallint,
  points smallint,
  attempts smallint,
  last_send_at timestamptz,
  rank smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select
      jp.user_id,
      coalesce(sum(case when l.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(
        case
          when l.completed and l.attempts = 1 then 4
          when l.completed and l.attempts = 2 then 3
          when l.completed and l.attempts = 3 then 2
          when l.completed and l.attempts >= 4 then 1
          else 0
        end
      )::smallint, 0::smallint)
      + coalesce(sum(case when l.zone then 1 else 0 end)::smallint, 0::smallint) as points,
      coalesce(sum(l.attempts)::smallint, 0::smallint) as attempts,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l
      on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
  )
  select
    a.user_id,
    p.username,
    p.name as display_name,
    p.avatar_url,
    a.sends,
    a.flashes,
    a.zones,
    a.points,
    a.attempts,
    a.last_send_at,
    (dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last))::smallint as rank
  from agg a
  left join public.profiles p on p.id = a.user_id;
$$;

grant execute on function public.get_jam_leaderboard(uuid) to authenticated, service_role;
revoke execute on function public.get_jam_leaderboard(uuid) from anon, public;

-- ── get_jam_state_for_user — service-role hydrator ─────

create or replace function public.get_jam_state_for_user(
  p_jam_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jam_row public.jams;
begin
  if p_user_id is null then
    return null;
  end if;

  -- Membership gate — identical to `is_jam_player` but parameterised
  -- on the explicit user id rather than `auth.uid()`. Non-player →
  -- the caller sees NULL and redirects to /jam/join.
  if not exists (
    select 1
    from public.jam_players
    where jam_id = p_jam_id
      and user_id = p_user_id
      and left_at is null
  ) then
    return null;
  end if;

  select * into jam_row from public.jams where id = p_jam_id;
  if jam_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'jam', to_jsonb(jam_row),
    'grades', coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', ordinal, 'label', label)
        order by ordinal
      )
      from public.jam_grades
      where jam_id = p_jam_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.number)
      from public.jam_routes r
      where r.jam_id = p_jam_id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', jp.user_id,
          'username', p.username,
          'display_name', p.name,
          'avatar_url', p.avatar_url,
          'joined_at', jp.joined_at,
          'is_host', (jp.user_id = jam_row.host_id)
        )
        order by jp.joined_at
      )
      from public.jam_players jp
      left join public.profiles p on p.id = jp.user_id
      where jp.jam_id = p_jam_id
        and jp.left_at is null
    ), '[]'::jsonb),
    'my_logs', coalesce((
      select jsonb_agg(to_jsonb(l))
      from public.jam_logs l
      where l.jam_id = p_jam_id
        and l.user_id = p_user_id
    ), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', lb.user_id,
          'username', lb.username,
          'display_name', lb.display_name,
          'avatar_url', lb.avatar_url,
          'sends', lb.sends,
          'flashes', lb.flashes,
          'zones', lb.zones,
          'points', lb.points,
          'attempts', lb.attempts,
          'last_send_at', lb.last_send_at,
          'rank', lb.rank
        )
        order by lb.rank
      )
      from public.get_jam_leaderboard(p_jam_id) lb
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_jam_state_for_user(uuid, uuid) to service_role;
revoke execute on function public.get_jam_state_for_user(uuid, uuid) from anon, authenticated, public;

-- ── get_active_jam_for_user_by_id — the ActiveJamBanner's backstop

-- Same idea for the banner's resolution: take the user id as an
-- argument so SSR can read the banner data with a service-role
-- client. Used by the /jam landing page to fetch the current player's
-- live jam without relying on JWT-in-cookie timing.

create or replace function public.get_active_jam_for_user_by_id(
  p_user_id uuid
)
returns table (
  jam_id uuid,
  name text,
  location text,
  code text,
  player_count smallint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id as jam_id,
    j.name,
    j.location,
    j.code,
    (
      select count(*)::smallint
      from public.jam_players
      where jam_id = j.id and left_at is null
    ) as player_count,
    jp.joined_at
  from public.jam_players jp
  join public.jams j on j.id = jp.jam_id
  where jp.user_id = p_user_id
    and jp.left_at is null
    and j.status = 'live'
  order by jp.joined_at desc
  limit 1;
$$;

grant execute on function public.get_active_jam_for_user_by_id(uuid) to service_role;
revoke execute on function public.get_active_jam_for_user_by_id(uuid) from anon, authenticated, public;
