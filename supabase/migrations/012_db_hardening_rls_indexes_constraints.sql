-- 012: DB hardening — RLS perf, duplicate policy fix, indexes, constraints
--
-- See docs/db-audit.md for the full rationale. Summary:
--   § A1  Wrap every bare auth.uid() in (select auth.uid()) so Postgres
--         evaluates it once per query instead of once per row (Supabase
--         lint 0003 auth_rls_initplan).
--   § A2  Drop the legacy permissive INSERT policy on route_logs that
--         silently lets users write into archived sets.
--   § A3  Add is_gym_admin / is_gym_owner helpers for upcoming admin work.
--   § B2  Add the 5 missing foreign-key indexes (Supabase lint 0001).
--   § D1  Add CHECK constraints on numeric columns that should be bounded.
--
-- No data-destructive operations — all changes are DDL plus policy rewrites.

-- ─────────────────────────────────────────────────────────────────
-- A1. Rewrite all RLS policies to wrap auth.uid() in (select …)
-- ─────────────────────────────────────────────────────────────────

-- profiles ──────────────
drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- gym_memberships ───────
drop policy if exists "Users can read their own memberships" on gym_memberships;
create policy "Users can read their own memberships"
  on gym_memberships for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can join listed gyms" on gym_memberships;
create policy "Users can join listed gyms"
  on gym_memberships for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from gyms where id = gym_id and is_listed = true)
  );

drop policy if exists "Users can leave gyms" on gym_memberships;
create policy "Users can leave gyms"
  on gym_memberships for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- route_logs ────────────
-- A2: drop the legacy "Gym members can create route logs" policy from
-- migration 002 — it was a permissive INSERT that coexisted with the
-- stricter archived-set-blocking policy from 003, so the OR evaluation
-- meant users could log into archived sets. Keep only the strict policy.
drop policy if exists "Gym members can create route logs" on route_logs;
drop policy if exists "Users can insert own route logs in active sets" on route_logs;
create policy "Users can insert own route logs in active sets"
  on route_logs for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and is_gym_member(gym_id)
    and exists (
      select 1 from routes r
      join sets s on s.id = r.set_id
      where r.id = route_id
        and s.active = true
    )
  );

drop policy if exists "Users can update their own route logs" on route_logs;
create policy "Users can update their own route logs"
  on route_logs for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own route logs" on route_logs;
create policy "Users can delete their own route logs"
  on route_logs for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- comments ──────────────
drop policy if exists "Gym members can create comments" on comments;
create policy "Gym members can create comments"
  on comments for insert
  to authenticated
  with check (user_id = (select auth.uid()) and is_gym_member(gym_id));

drop policy if exists "Users can update their own comments" on comments;
create policy "Users can update their own comments"
  on comments for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own comments" on comments;
create policy "Users can delete their own comments"
  on comments for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- comment_likes ─────────
drop policy if exists "Gym members can create comment likes" on comment_likes;
create policy "Gym members can create comment likes"
  on comment_likes for insert
  to authenticated
  with check (user_id = (select auth.uid()) and is_gym_member(gym_id));

drop policy if exists "Users can delete their own likes" on comment_likes;
create policy "Users can delete their own likes"
  on comment_likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- activity_events ───────
drop policy if exists "Gym members can read activity events" on activity_events;
create policy "Gym members can read activity events"
  on activity_events for select
  to authenticated
  using (
    (route_id is null and user_id = (select auth.uid()))
    or (route_id is not null and is_gym_member(gym_id))
  );

drop policy if exists "Gym members can create activity events" on activity_events;
create policy "Gym members can create activity events"
  on activity_events for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (gym_id is null or is_gym_member(gym_id))
  );

-- follows ───────────────
drop policy if exists "Users can follow others" on follows;
create policy "Users can follow others"
  on follows for insert
  to authenticated
  with check (follower_id = (select auth.uid()));

drop policy if exists "Users can unfollow" on follows;
create policy "Users can unfollow"
  on follows for delete
  to authenticated
  using (follower_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────
-- A3. Admin / owner helpers
-- ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER + empty search_path so they bypass RLS on
-- gym_memberships (otherwise policies that call these would recursively
-- trigger membership-table RLS evaluation).

create or replace function is_gym_admin(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_memberships
    where gym_id = p_gym_id
      and user_id = (select auth.uid())
      and role in ('admin', 'owner')
  );
$$;

grant execute on function is_gym_admin(uuid) to authenticated;
revoke execute on function is_gym_admin(uuid) from anon, public;

create or replace function is_gym_owner(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_memberships
    where gym_id = p_gym_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

grant execute on function is_gym_owner(uuid) to authenticated;
revoke execute on function is_gym_owner(uuid) from anon, public;

-- Also update is_gym_member to use (select auth.uid()) for consistency —
-- the function is SECURITY DEFINER so the micro-optimisation is tiny, but
-- keeping the pattern uniform makes audit trivial.
create or replace function is_gym_member(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_memberships
    where user_id = (select auth.uid()) and gym_id = p_gym_id
  );
$$;

-- ─────────────────────────────────────────────────────────────────
-- B2. Missing foreign-key indexes
-- ─────────────────────────────────────────────────────────────────

-- profiles.active_gym_id — queries like "who belongs to this gym and
-- has it as active" need this to avoid a seq scan on profiles.
create index if not exists profiles_active_gym_id_idx
  on profiles (active_gym_id)
  where active_gym_id is not null;

-- comments.user_id — "all my comments" / profile activity feed
create index if not exists comments_user_id_idx
  on comments (user_id);

-- comments.parent_id — threaded reply fetch
create index if not exists comments_parent_id_idx
  on comments (parent_id)
  where parent_id is not null;

-- comment_likes.comment_id — the existing unique(user_id, comment_id)
-- has user_id first, so a "likes for this comment" lookup can't use it.
create index if not exists comment_likes_comment_id_idx
  on comment_likes (comment_id);

-- activity_events.route_id — route-scoped activity feed
create index if not exists activity_events_route_id_idx
  on activity_events (route_id)
  where route_id is not null;

-- ─────────────────────────────────────────────────────────────────
-- D1. Numeric CHECK constraints
-- ─────────────────────────────────────────────────────────────────
-- Done in one block: any existing bad data is corrected first so the
-- ALTER ... ADD CONSTRAINT doesn't fail. (Triggers + app code already
-- maintain non-negative values in practice; these are belt-and-braces
-- so the DB enforces invariants directly.)

-- routes.number must be positive (walls are 1-indexed in the app)
update routes set number = 1 where number <= 0;
alter table routes
  add constraint routes_number_positive check (number > 0);

-- route_logs.attempts must be non-negative
update route_logs set attempts = 0 where attempts < 0;
alter table route_logs
  add constraint route_logs_attempts_non_negative check (attempts >= 0);

-- profiles.follower_count / following_count must be non-negative
-- (trigger already clamps via greatest(0, …); add the invariant at the DB
-- so any future direct SQL write can't drive them negative).
update profiles set follower_count = 0 where follower_count < 0;
update profiles set following_count = 0 where following_count < 0;
alter table profiles
  add constraint profiles_follower_count_non_negative check (follower_count >= 0),
  add constraint profiles_following_count_non_negative check (following_count >= 0);
