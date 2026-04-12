# Chork — Supabase audit (pre-admin hardening)

> **Status:** This audit was captured against migration `011`, before
> the admin / dashboard work landed. Every issue it flagged was fixed
> in migrations 012–022. Keeping the doc as a historical record —
> when the next audit pass runs, add a new file (e.g.
> `docs/db-audit-2.md`) rather than overwriting this one. `docs/schema.md`
> is the always-current reference for schema questions.

Audit of the DB as of migration `011` before the admin / dashboard feature work begins. Goal: security, performance, schema hygiene. Not a feature list.

This doc lists every issue found, what it breaks, and which migration fixes it.

---

## Tables audited (13)

`gyms`, `profiles`, `gym_memberships`, `sets`, `routes`, `route_logs`, `comments`, `comment_likes`, `activity_events`, `follows`, `user_achievements`.

---

## A. RLS policy correctness

### A1. Every bare `auth.uid()` re-evaluates per row

The Supabase lint `0003 auth_rls_initplan` fires for every policy that uses `auth.uid() = ...` directly. Postgres treats the call as volatile and re-executes it for each row the policy checks.

Affected policies (12 total):

| Table | Operation | Current | Fix |
|---|---|---|---|
| `profiles` | UPDATE | `auth.uid() = id` | `(select auth.uid()) = id` |
| `gym_memberships` | SELECT / INSERT / DELETE | `user_id = auth.uid()` | `user_id = (select auth.uid())` |
| `route_logs` | INSERT / UPDATE / DELETE | `user_id = auth.uid()` | `user_id = (select auth.uid())` |
| `comments` | INSERT / UPDATE / DELETE | `user_id = auth.uid()` | `user_id = (select auth.uid())` |
| `comment_likes` | INSERT / DELETE | `user_id = auth.uid()` | `user_id = (select auth.uid())` |
| `activity_events` | SELECT / INSERT | `user_id = auth.uid()` | `user_id = (select auth.uid())` |
| `follows` | INSERT / DELETE | `follower_id = auth.uid()` | `follower_id = (select auth.uid())` |

**Fixed in 012**.

### A2. Duplicate permissive INSERT policies on `route_logs` (silent security bug)

Migration `003_atomic_likes_and_archived_set_policy.sql` attempted to tighten the INSERT policy to block archived sets. It runs:

```sql
drop policy if exists "Users can insert own route logs" on route_logs;
create policy "Users can insert own route logs in active sets" ...
```

But the policy that actually existed (from `002`) was `"Gym members can create route logs"` — the drop silently did nothing. The result: two permissive INSERT policies coexist, evaluated with OR, and the looser `"Gym members can create route logs"` wins — **users can currently log climbs into archived sets despite `003` intending to block this**.

**Fixed in 012** by dropping the legacy policy and keeping only the strict one.

### A3. Missing admin helper function

There is an `is_gym_member(gym_id)` helper but no `is_gym_admin(gym_id)` or `is_gym_owner(gym_id)`. The admin dashboard work will need these; adding them now — stable, cacheable `SECURITY DEFINER` with `search_path=''` — means future policies can check admin role without each policy performing its own `gym_memberships` join (which would otherwise re-trigger RLS recursively).

**Added in 012**: `is_gym_admin(uuid)`, `is_gym_owner(uuid)`.

### A4. RLS explicitly enabled on every public table

Verified: `gyms`, `profiles`, `gym_memberships`, `sets`, `routes`, `route_logs`, `comments`, `comment_likes`, `activity_events`, `follows`, `user_achievements` — all have `alter table ... enable row level security`. No public tables are unprotected. ✅

Some tables have SELECT-only policies by design (`routes`, `sets`, `gyms`, `user_achievements`) — writes are intentionally service-role-only. This is correct and documented in each migration.

### A5. No recursive RLS risk

`is_gym_member` is `SECURITY DEFINER` with empty `search_path`, so when it's called from a policy the function runs without triggering RLS on `gym_memberships`. ✅

---

## B. Indexing

### B1. Existing indexes (good coverage)

- `gyms (is_listed) where is_listed`
- `gym_memberships (user_id)`, `(gym_id)`, unique `(user_id, gym_id)`
- `sets (gym_id, active)`, `(gym_id, ends_at)` (from 011)
- `routes` — unique `(set_id, number)` covers `set_id` lookups
- `route_logs (route_id, completed)`, `(gym_id)`, `(user_id)` (from 009), unique `(user_id, route_id)`
- `comments (route_id, likes desc, created_at desc)`, `(gym_id)`
- `comment_likes` — unique `(user_id, comment_id)`, `(gym_id)`
- `activity_events (user_id, created_at desc)`, `(gym_id) where not null`
- `follows (follower_id)`, `(following_id)`, unique
- `user_achievements (user_id)`, unique `(user_id, badge_id)`

### B2. Missing foreign-key indexes (Supabase lint `0001 unindexed_foreign_keys`)

| Column | Query pattern affected |
|---|---|
| `profiles.active_gym_id` | Onboarding gym switch; cascade-safety |
| `comments.user_id` | "All my comments" / profile activity |
| `comments.parent_id` | Threaded reply fetch |
| `comment_likes.comment_id` | "Likes on this comment" — the existing `unique(user_id, comment_id)` has `user_id` first so is not usable for a `comment_id`-only lookup |
| `activity_events.route_id` | Route-scoped activity feed |

**Added in 012** (all partial indexes where appropriate to avoid indexing nulls).

### B3. No duplicate or unused indexes detected

Each existing index has a distinct access pattern. No lint `0005 unused_index` / `0009 duplicate_index` equivalents visible in the migration history.

---

## C. Aggregation / leaderboard performance

### C1. `get_leaderboard_*` re-aggregates raw `route_logs` on every call

The four leaderboard RPCs (`_set`, `_all_time`, `_neighbourhood`, `_user_row`) each run a CTE that:

1. Joins `route_logs → routes → sets`
2. Filters by `gym_id` / `set_id`
3. Sums points + counts per user
4. Windows `dense_rank()`

For a gym at ~1k members × 20 routes × 2 sets/mo × 12 mo ≈ 480k raw logs, this is a full gym scan per leaderboard paint. Current users: small enough that it's fine; a single viral week could make leaderboard paints visibly slow.

### C2. Materialised `user_set_stats`

Introduced in **013**. A row per `(user_id, set_id)` holds `sends / flashes / zones / points`, maintained by an `AFTER INSERT / UPDATE / DELETE` trigger on `route_logs`. The trigger recomputes the affected `(user, set)` pair only — O(routes-in-set) per write, which is a handful of rows.

Leaderboard RPCs rewritten to read from this table:

- **Set leaderboard**: `SELECT … FROM user_set_stats WHERE set_id = ? + rank()` — reads at most one row per user in that set.
- **All-time leaderboard**: `SELECT user_id, SUM(points), … FROM user_set_stats WHERE gym_id = ? GROUP BY user_id + rank()` — aggregates across at most `(users × sets)` rows, still ~100× smaller than the raw-log path.
- **Neighbourhood / user-row**: unchanged structure, same data source.

### C3. Other RPC hygiene

All existing `SECURITY DEFINER` functions already have `set search_path = ''` (from 008). ✅
All functions have explicit `grant execute ... to authenticated` and `revoke ... from anon, public`. ✅
`increment_comment_likes` bounds `p_delta` to `{-1, 1}`. ✅

---

## D. Schema hygiene

### D1. Missing CHECK constraints (lint: "columns that should have constraints")

| Column | Missing constraint |
|---|---|
| `routes.number` | `> 0` — currently accepts 0 and negative |
| `route_logs.attempts` | `>= 0` |
| `profiles.follower_count` | `>= 0` (trigger already clamps, but DB doesn't enforce) |
| `profiles.following_count` | `>= 0` (same) |

**Added in 012.**

### D2. Types are correct

- All timestamps are `timestamptz` ✅
- All IDs are `uuid` ✅
- `gym_memberships.role`, `activity_events.type`, `route_logs.grade_vote` use CHECK constraints ✅

### D3. PKs and FKs

Every table has a PK. Every relation has an explicit FK constraint with `on delete cascade` where appropriate. ✅

### D4. Denormalised counts

`profiles.follower_count` / `following_count` are maintained by trigger (migration 004). `route_logs.gym_id`, `comments.gym_id`, `activity_events.gym_id`, `comment_likes.gym_id` are denormalised for RLS performance — never change after insert. ✅

---

## E. Security hardening

### E1. `service_role` key usage

Grep of the entire codebase for `SUPABASE_SERVICE_ROLE_KEY` / `createServiceClient` / `service_role`:

- `src/lib/supabase/server.ts` — reads env; file starts with `import "server-only"` ✅
- `src/lib/data/mutations.ts` — imports `createServiceClient`; `"server-only"` ✅
- `src/lib/user-actions.ts` — `"use server"` ✅
- `scripts/seed-set.ts` — local seed script, not shipped ✅
- Test files (mocked) — no functional reference ✅

**Zero client-side exposure.**

### E2. Server actions derive userId from session

All 11 actions in `src/app/(app)/actions.ts` + `src/app/u/[username]/actions.ts` + `src/app/leaderboard/actions.ts` call `requireAuth()` / `requireSignedIn()` and never trust a client-supplied userId. `editComment` also does explicit ownership check. ✅

### E3. No raw `auth.users` exposure

There is no public view that joins `auth.users`. Profiles expose only `id, username, name, avatar_url, follower_count, following_count, onboarded, active_gym_id, created_at`. Email and auth metadata stay in `auth`. ✅

### E4. `search_path` hardening

All `SECURITY DEFINER` functions set `search_path = ''` (from 008). ✅

---

## F. Offline sync integrity

### F1. Idempotent climb-log writes

`upsertRouteLog` in `src/lib/data/mutations.ts` uses `supabase.from("route_logs").upsert({…}, { onConflict: "user_id,route_id" })`. The DB has `unique (user_id, route_id)` on `route_logs`. A retry inserts the same `(user_id, route_id)` pair → DO UPDATE, never duplicates. ✅

### F2. Offline queue compaction

`src/lib/offline/mutation-queue.ts` dedupes pending mutations per route — completeRoute supersedes updateAttempts / toggleZone / updateGradeVote; uncompleteRoute supersedes completeRoute. A network retry fires the same server action at most once per flush cycle. Even if a retry slips past the queue layer, the upsert at the DB is idempotent. ✅

---

## G. What 012 and 013 change

### 012 — `db_hardening_rls_indexes_constraints.sql`

1. Wraps every bare `auth.uid()` / `auth.jwt()` in `(select …)` — fixes lint 0003.
2. Drops the duplicate permissive INSERT on `route_logs`; keeps only `"Users can insert own route logs in active sets"`.
3. Adds helpers `is_gym_admin(uuid)` and `is_gym_owner(uuid)` (ready for admin features, not wired yet).
4. Adds the 5 missing FK indexes from §B2.
5. Adds CHECK constraints from §D1.

### 013 — `user_set_stats_materialized.sql`

1. Creates `user_set_stats` table with trigger-maintained aggregates.
2. Backfills from existing `route_logs`.
3. Replaces the four leaderboard RPCs with versions that read from the materialised table.

---

## H. Verification that must run on the live DB

I can only write the migrations. Before production roll-out please run, in order:

1. Apply 012 + 013 on staging.
2. `EXPLAIN ANALYZE` the five hot queries:
   - `select * from get_leaderboard_set(?, ?)`
   - `select * from get_leaderboard_all_time(?)`
   - `select * from get_leaderboard_user_row(?, ?, ?)`
   - wall page: `getRoutesBySet` + `getLogsBySetForUser`
   - profile: `getAllRouteDataForUserInGym`
3. In the Supabase dashboard → **Database › Advisors** → run Security + Performance advisors and resolve anything that still fires.
4. Spot-check RLS with `set role authenticated; set "request.jwt.claim.sub" = '<non-member-uuid>';` and confirm zero rows bleed across gyms.

Targets after rollout:

- Leaderboard set-scoped RPC: < 50 ms at p95 for a 1k-member gym.
- Wall page data fetch: < 100 ms.
- Profile page data fetch: < 200 ms.
- `pg_stat_statements` "calls vs mean_time" should show the leaderboard RPCs near the top of the **calls** column but **not** the **total_time** column.
