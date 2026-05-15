-- Two jam fixes packaged together because they share a deploy window
-- and both target live-jam (not post-jam) state:
--
--   1. Realtime publication + replica identity were added in
--      migration 055 with plain `alter publication add table` /
--      `alter table replica identity full`. The replica-identity
--      statement is idempotent (no-op when already FULL) but the
--      publication-add statement errors with "table is already
--      member of publication" if 055 ran successfully. That makes
--      055 un-replayable on a fresh database that re-runs the migration
--      set, and any environment where 055 didn't apply cleanly is
--      stuck without a safe re-apply path.
--
--      Wrap each `add table` in an existence check via
--      pg_publication_tables so the membership is guaranteed without
--      regard to prior state. Symptoms when membership is missing:
--      newly added jam routes don't propagate to other players' UIs
--      (issue 1 — "have to refresh to see new routes"), other
--      players' log changes don't show up live (issue 2 — "other
--      players always show 0 points until end").
--
--   2. The live-jam leaderboard RPC `get_jam_leaderboard` (last
--      redefined in migration 048) returns `attempts smallint` for
--      every player to every authenticated caller. CLAUDE.md domain
--      rule: "Attempt counts are private — never show raw attempts
--      to other users." Migration 052 fixed the equivalent leak on
--      the post-jam `get_jam_summary_for_user` hydrator; same
--      treatment for the live RPC here.
--
--      Mask via `case when jp.user_id = (select auth.uid()) then …
--      else 0 end`. When the function is invoked through the
--      service-role hydrator `get_jam_state_for_user`, auth.uid()
--      returns NULL inside SECURITY DEFINER — so every row's
--      attempts field collapses to 0 in that path too. That's the
--      correct semantic: `get_jam_state_for_user` is the only
--      consumer that reads `attempts` out of `get_jam_leaderboard`,
--      and the field isn't rendered for any player in the UI
--      anyway (the wall + jam UIs both compute their per-player
--      tile state from `completed` + `attempts === 1` flash flag,
--      neither of which is privacy-sensitive). Client-side
--      sanitisation of jam_logs realtime events (see JamScreen.tsx)
--      paired with this RPC mask is the defence-in-depth pair.

-- ── 1. Idempotent realtime publication + replica identity ──

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jam_routes'
  ) then
    alter publication supabase_realtime add table public.jam_routes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jam_logs'
  ) then
    alter publication supabase_realtime add table public.jam_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jam_players'
  ) then
    alter publication supabase_realtime add table public.jam_players;
  end if;
end $$;

-- REPLICA IDENTITY FULL is idempotent — no-op when already FULL.
alter table public.jam_routes replica identity full;
alter table public.jam_logs replica identity full;
alter table public.jam_players replica identity full;

-- ── 2. get_jam_leaderboard — mask attempts per caller ──

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
    -- Privacy: own attempts pass through, every other player sees 0.
    -- Matches the pattern in get_jam_summary_for_user (migration 055).
    case when a.user_id = (select auth.uid()) then a.attempts else 0::smallint end as attempts,
    a.last_send_at,
    (dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last))::smallint as rank
  from agg a
  left join public.profiles p on p.id = a.user_id;
$$;

grant execute on function public.get_jam_leaderboard(uuid) to authenticated, service_role;
revoke execute on function public.get_jam_leaderboard(uuid) from anon, public;
