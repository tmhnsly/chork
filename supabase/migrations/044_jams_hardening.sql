-- Jams feature hardening — fixes from code review of 041/042/043.
--
-- Fixes:
--  1. jam_summary_players PK ↔ `on delete set null` conflict.
--     Switch to a surrogate id, keep a partial unique index for
--     non-null user_ids. Deleting a profile no longer errors.
--  2. Drop the mis-named `jam_logs_updated_at` trigger — it called
--     bump_jam_last_activity (wrong target). `upsert_jam_log` sets
--     updated_at explicitly, so the trigger was redundant.
--  3. `add_jam_route` race: two players inserting at once could
--     collide on max(number) + 1. Lock the jams row first.
--  4. `end_jam` is granted to `authenticated` — any authed user who
--     knows a jam id could bypass the player check by calling the
--     raw RPC. Revoke, leave only `end_jam_as_player` for clients.
--  5. `jams` SELECT was wide open (any authed user could enumerate
--     every jam's code + location). Tighten to players only; the
--     pre-join confirm flow already uses `join_jam_by_code` which
--     is SECURITY DEFINER so it keeps working.
--  6. `get_jam_achievement_context` Iron Crew CTE grows O(k²) per
--     jam and O(n²) across the caller's history. Cap to the caller's
--     most recent 200 jams so the worst case stays bounded.

-- ── 1. Restructure jam_summary_players PK ──────────

-- We drop the existing PK and add a surrogate. `on delete set null`
-- on user_id now actually works — the row survives with null
-- user_id + snapshotted display_name/username for posterity.
alter table public.jam_summary_players drop constraint jam_summary_players_pkey;

alter table public.jam_summary_players
  add column id uuid not null default gen_random_uuid() primary key;

-- One row per (summary, user) when user_id is non-null. After an
-- account deletion the row becomes "anonymous participant" — still
-- counts toward jam_player_count but can't be dedup-matched.
create unique index jam_summary_players_summary_user_idx
  on public.jam_summary_players (jam_summary_id, user_id)
  where user_id is not null;

-- ── 2. Drop the mis-named updated_at trigger ──────

drop trigger if exists jam_logs_updated_at on public.jam_logs;

-- ── 3. add_jam_route race fix ─────────────────────
-- Lock the parent jam row before reading max(number) so concurrent
-- inserts queue rather than collide on the unique(jam_id, number)
-- constraint.

drop function if exists public.add_jam_route(uuid, text, smallint, boolean);

create or replace function public.add_jam_route(
  p_jam_id uuid,
  p_description text default null,
  p_grade smallint default null,
  p_has_zone boolean default false
)
returns public.jam_routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_number integer;
  result public.jam_routes;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_jam_player(p_jam_id) then
    raise exception 'Not a player in this jam' using errcode = '42501';
  end if;

  -- Lock the parent jam row for the duration of the transaction.
  -- Concurrent add_jam_route calls block here and serialise —
  -- second caller sees the first's insert in max(number).
  perform 1
    from public.jams
    where id = p_jam_id and status = 'live'
    for update;
  if not found then
    raise exception 'Jam is not live' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into next_number
  from public.jam_routes
  where jam_id = p_jam_id;

  insert into public.jam_routes (
    jam_id, number, description, grade, has_zone, added_by
  ) values (
    p_jam_id,
    next_number,
    nullif(trim(coalesce(p_description, '')), ''),
    p_grade,
    coalesce(p_has_zone, false),
    caller_id
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.add_jam_route(uuid, text, smallint, boolean) to authenticated;
revoke execute on function public.add_jam_route(uuid, text, smallint, boolean) from anon, public;

-- ── 4. Revoke end_jam from authenticated ──────────
-- Clients should only call end_jam_as_player (which enforces the
-- player-membership check). The bare end_jam is for service-role
-- callers: end_stale_jams cron + end_jam_as_player itself
-- (SECURITY DEFINER bypasses the grant check on internal calls).

revoke execute on function public.end_jam(uuid) from authenticated, anon, public;
grant execute on function public.end_jam(uuid) to service_role;

-- ── 5. Tighten jams SELECT policy ─────────────────
-- Players see their own jams. The pre-join confirm flow uses the
-- `join_jam_by_code` SECURITY DEFINER RPC, which bypasses RLS, so
-- tightening here doesn't break code-based joins.

drop policy if exists jams_select on public.jams;

create policy jams_select on public.jams
  for select to authenticated
  using (
    public.is_jam_player(id)
    or host_id = (select auth.uid())
  );

-- ── 6. Bound Iron Crew CTE ────────────────────────
-- Cap self_summaries at the caller's most recent 200 jams. For
-- typical users (a dozen jams across a season) this is a no-op;
-- for very heavy users it stops the pair-self-join from becoming
-- quadratic in the full lifetime history.

create or replace function public.get_jam_achievement_context(p_user_id uuid)
returns table (
  jams_played integer,
  jams_won integer,
  jams_hosted integer,
  max_players_in_won_jam integer,
  unique_coplayers integer,
  max_iron_crew_pair_count integer,
  jam_total_flashes integer,
  jam_total_sends integer,
  jam_total_points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with self_summaries_all as (
    select s.id, s.player_count, s.host_id, jsp.is_winner, s.ended_at
    from public.jam_summaries s
    join public.jam_summary_players jsp
      on jsp.jam_summary_id = s.id and jsp.user_id = p_user_id
  ),
  -- Full history feeds the simple counters + progress totals; no
  -- self-join cost there.
  self_summaries_recent as (
    select id, player_count, host_id, is_winner
    from self_summaries_all
    order by ended_at desc
    limit 200
  ),
  coplayers as (
    select distinct jsp.user_id
    from self_summaries_all ss
    join public.jam_summary_players jsp
      on jsp.jam_summary_id = ss.id
    where jsp.user_id is not null
      and jsp.user_id <> p_user_id
  ),
  jam_mates as (
    -- Bounded to the recent-200 window so the self-join stays
    -- tractable even for power users.
    select ss.id as summary_id, jsp.user_id as mate_id
    from self_summaries_recent ss
    join public.jam_summary_players jsp
      on jsp.jam_summary_id = ss.id
    where jsp.user_id is not null
      and jsp.user_id <> p_user_id
  ),
  mate_pairs as (
    select a.summary_id, a.mate_id as mate_a, b.mate_id as mate_b
    from jam_mates a
    join jam_mates b
      on a.summary_id = b.summary_id
     and a.mate_id < b.mate_id
  ),
  pair_counts as (
    select mate_a, mate_b, count(*) as shared_jams
    from mate_pairs
    group by mate_a, mate_b
  )
  select
    (select count(*)::integer from self_summaries_all) as jams_played,
    (select count(*)::integer from self_summaries_all where is_winner) as jams_won,
    (
      select count(*)::integer
      from self_summaries_all
      where host_id = p_user_id
    ) as jams_hosted,
    coalesce((
      select max(player_count)::integer
      from self_summaries_all
      where is_winner
    ), 0) as max_players_in_won_jam,
    (select count(*)::integer from coplayers) as unique_coplayers,
    coalesce((select max(shared_jams)::integer from pair_counts), 0) as max_iron_crew_pair_count,
    coalesce((
      select sum(jsp.flashes)::integer
      from public.jam_summary_players jsp
      where jsp.user_id = p_user_id
    ), 0) as jam_total_flashes,
    coalesce((
      select sum(jsp.sends)::integer
      from public.jam_summary_players jsp
      where jsp.user_id = p_user_id
    ), 0) as jam_total_sends,
    coalesce((
      select sum(jsp.points)::integer
      from public.jam_summary_players jsp
      where jsp.user_id = p_user_id
    ), 0) as jam_total_points;
$$;

grant execute on function public.get_jam_achievement_context(uuid) to authenticated;
revoke execute on function public.get_jam_achievement_context(uuid) from anon, public;
