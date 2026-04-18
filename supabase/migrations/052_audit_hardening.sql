-- Audit-pass hardening — combines five unrelated fixes into one
-- migration because they share a deploy window and all regressed
-- because of gaps between different migration generations.
--
--   1. `jam_summaries` RLS was `using (true)` — any authenticated
--      user could enumerate every jam's host / location / payload.
--   2. `jam_summary_players` RLS was `using (true)` — any user
--      could direct-SELECT every player's raw `attempts` column,
--      bypassing the RPC-layer attempt mask introduced in 051.
--   3. `handle_new_user` from migration 051 had an `ON CONFLICT
--      (username) DO UPDATE SET username = …` which — on a
--      username collision — overwrites the EXISTING user's row
--      rather than the incoming one. Correct shape is a PK
--      `ON CONFLICT (id)` + full-uuid seed (collisions require
--      identical UUIDs, which won't happen).
--   4. `get_jam_summary` relies on `auth.uid()` inside a
--      SECURITY DEFINER body — same stale-JWT class that hit
--      `get_jam_state`. On SSR with a refreshed-mid-request token,
--      `auth.uid()` resolves NULL, the mask treats the owner as
--      "other", and they see their own attempts as 0. Replace with
--      a service-role variant that takes `p_user_id` explicitly.
--   5. `update_updated_at()` (migration 001) was never given
--      `set search_path = ''` when migration 008 hardened every
--      other SECURITY DEFINER function. Add it — Supabase's own
--      linter flags the omission.

-- ── 1. jam_summaries RLS ────────────────────────────

drop policy if exists jam_summaries_select on public.jam_summaries;

create policy jam_summaries_select on public.jam_summaries
  for select to authenticated
  using (
    host_id = (select auth.uid())
    or exists (
      select 1
      from public.jam_summary_players jsp
      where jsp.jam_summary_id = id
        and jsp.user_id = (select auth.uid())
    )
  );

-- ── 2. jam_summary_players RLS ──────────────────────
-- A player can see rows for any summary they participated in — so
-- the full board of their own jams remains visible — plus their
-- own rows in any other summary. `get_jam_summary` (SECURITY
-- DEFINER, replaced below) stays authoritative for public
-- summary payloads; this policy only closes the "direct SELECT
-- against the table reads every row" path.

drop policy if exists jam_summary_players_select on public.jam_summary_players;

create policy jam_summary_players_select on public.jam_summary_players
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.jam_summary_players self
      where self.jam_summary_id = jam_summary_players.jam_summary_id
        and self.user_id = (select auth.uid())
    )
  );

-- ── 3. handle_new_user — PK conflict target ─────────
-- Full-uuid seed means usernames can't collide unless the id
-- column does (impossible — it's a v4 uuid PK). `ON CONFLICT
-- (id) DO NOTHING` safeguards against a re-trigger on the same
-- auth.users row (e.g. a restore) without touching any other
-- user's row.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || replace(new.id::text, '-', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── 4. get_jam_summary_for_user — service-role mask ──
-- Takes `p_user_id` as an explicit argument so the caller can
-- come in via `createServiceClient()` after authenticating via
-- `requireSignedIn`. Mirrors `get_jam_state_for_user` from
-- migration 048. The mask (zero `attempts` for non-caller rows)
-- now runs against a value that can't go NULL mid-request.

create or replace function public.get_jam_summary_for_user(
  p_summary_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'summary', to_jsonb(s),
      'players', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', jsp.user_id,
            'username', jsp.username,
            'display_name', jsp.display_name,
            'rank', jsp.rank,
            'sends', jsp.sends,
            'flashes', jsp.flashes,
            'zones', jsp.zones,
            'points', jsp.points,
            -- Privacy: attempt counts are private per CLAUDE.md.
            -- Return the caller's own count, zero for everyone else.
            'attempts', case when jsp.user_id = p_user_id then jsp.attempts else 0 end,
            'is_winner', jsp.is_winner,
            'avatar_url', p.avatar_url
          )
          order by jsp.rank
        )
        from public.jam_summary_players jsp
        left join public.profiles p on p.id = jsp.user_id
        where jsp.jam_summary_id = s.id
      ), '[]'::jsonb)
    )
    from public.jam_summaries s
    where s.id = p_summary_id
    limit 1
  );
end;
$$;

grant execute on function public.get_jam_summary_for_user(uuid, uuid) to service_role;
revoke execute on function public.get_jam_summary_for_user(uuid, uuid) from anon, authenticated, public;

-- Drop the old `get_jam_summary` — its only caller
-- (`getJamSummaryBundle`) is moving to the _for_user variant.
-- Keeping it around with the auth.uid() mask left a landmine for
-- future devs reaching for the closer-to-hand helper.

drop function if exists public.get_jam_summary(uuid);

-- ── 5. update_updated_at — explicit search_path ────

create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
