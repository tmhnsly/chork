-- ────────────────────────────────────────────────────────────────
-- Achievements: exact times stay with their owner
-- ────────────────────────────────────────────────────────────────
--
-- Found by the pre-merge security review of 131, and then by pulling
-- on the thread.
--
-- ── 1. `get_achievement_activity` leaked clock times ────────────
--
-- 131 added `get_achievement_activity(p_user_id)` for the profile
-- shelf's recency ranking. It took a caller-supplied uid, checked
-- nothing against `auth.uid()`, was granted to `authenticated`, and
-- returned raw `timestamptz` — the exact moment of the climber's last
-- flash, last send, last match. The profile page called it for EVERY
-- profile with the profile owner's id, and the result rode into a
-- client component's props, so a stranger's page load carried "this
-- person was on the wall at 14:32:07 today". That is precisely the
-- inference CLAUDE.md's coarse-timestamp rule exists to prevent, and
-- 131's own comment ("these are the caller's OWN activity") described
-- a check the function never made.
--
-- Now: no parameter — it is the caller's own activity by construction
-- — and it returns DATES. The shelf ranks by recency and a day is all
-- the ranking needs; two ladders moved the same day tie and fall back
-- to catalogue order, which reads fine. Visited profiles never call
-- it; the app picks their shelf from earned dates alone.
--
-- ── 2. `user_achievements.earned_at` was readable by everyone ───
--
-- Migration 010 made the table SELECT-able by any authenticated user
-- (`using (true)`) with the exact `earned_at`. A badge is earned by a
-- send, so `earned_at` IS a send time, and the same inference held —
-- through supabase-js directly, for any climber, since April. The
-- policy is now own-rows-only, and everyone else reads through
-- `get_earned_achievements`, which returns `earned_on` as a DATE. The
-- detail sheet only ever displayed the day, so nothing visible
-- changes; what changes is that the clock time no longer leaves the
-- database for anyone but its owner.
--
-- ── 3. Wall sends have never persisted an achievement ───────────
--
-- 010 also says "writes are performed via the service role" and
-- created no INSERT policy. That was true of match ends and false of
-- the wall: `completeRoute` has passed the CLIMBER's client to the
-- evaluator since the day the feature landed, so every upsert was
-- refused by RLS, the evaluator caught it, and the "you earned a
-- badge" toast never once fired for a wall send. Nobody noticed
-- because the profile DERIVES earned state live and only overlays
-- the persisted date — the badge showed, undated. In production, the
-- only climber with rows was the one who had ended a match. That is
-- an app-side fix (the evaluator gets the service client, as 010
-- intended); it is recorded here because this is where the policy
-- that refused it lives, and because 131's "recently completed"
-- ranking depended on dates that were never written.

-- ── Activity: self-only, day-coarse ─────────────────────────────

drop function if exists public.get_achievement_activity(uuid);

create or replace function public.get_achievement_activity()
returns table (
  last_flash_on date,
  last_send_on date,
  last_match_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select max(rl.completed_at)::date from public.route_logs rl
      where rl.user_id = (select auth.uid()) and rl.completed and rl.attempts = 1),
    (select max(rl.completed_at)::date from public.route_logs rl
      where rl.user_id = (select auth.uid()) and rl.completed),
    (select max(s.ends_at)::date from public.set_players sp
      join public.sets s on s.id = sp.set_id
      where sp.user_id = (select auth.uid())
        and s.owner_kind = 'climber'
        and s.status = 'archived')
  where (select auth.uid()) is not null;
$$;

revoke execute on function public.get_achievement_activity() from anon, public;
grant execute on function public.get_achievement_activity() to authenticated;

-- ── Earned: own rows direct, everyone else through the day ──────

drop policy if exists "user_achievements readable by authenticated" on public.user_achievements;

create policy "user_achievements: own rows"
  on public.user_achievements for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Profiles are public in this app and the badges on them follow —
-- 010's rule still holds. Only the grain changes: a day, not a clock.
create or replace function public.get_earned_achievements(p_user_id uuid)
returns table (
  badge_id text,
  earned_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select ua.badge_id, ua.earned_at::date
  from public.user_achievements ua
  where ua.user_id = p_user_id
    and (select auth.uid()) is not null;
$$;

revoke execute on function public.get_earned_achievements(uuid) from anon, public;
grant execute on function public.get_earned_achievements(uuid) to authenticated, service_role;
