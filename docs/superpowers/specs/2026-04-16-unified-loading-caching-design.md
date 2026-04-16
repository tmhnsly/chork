# Unified Loading + Caching Strategy (v2, deep audit)

**Date:** 2026-04-16
**Status:** Design — pending implementation plan
**Revision:** v2 supersedes v1. v1 was summarised from subagent reports;
v2 is authored from direct reads of the critical path code. All findings
carry `file:line` references.

## Goal

Make Chork feel snappy after user interaction, and cut duplicated database
load so viewer concurrency scales linearly in DB writes, not reads.
Replace the current mix of path revalidation + two ad-hoc client Maps +
no shared server cache with one coherent architecture that a contributor
can understand in one sitting.

Success criteria (each measurable on staging):

1. **Profile shell paints under 400ms warm**, under 1.2s cold on 4G.
   First byte of HTML visible immediately; stats/rings/achievements
   stream under Suspense.
2. **Chorkboard tab switches stay instant** (they already are client-side)
   AND the first paint no longer issues 15 Supabase round trips
   (current state, §2.3) — target ≤ 5.
3. **N concurrent leaderboard viewers cost 1 DB compute per mutation**,
   not N per refresh. Headroom against "busy gym evening" concurrency.
4. **No server action invalidates more of the router cache than it
   affects.** Grep for `revalidatePath.*"/".*"layout"` in a non-onboarding
   file returns zero hits.
5. **Post-send latency under 300ms** on the `completeRoute` action.
   Badge evaluation no longer blocks the action return.
6. **One documented pattern per layer.** A new contributor reads
   `docs/architecture.md` and can answer "where does X cache and when
   does it go stale?" for any piece of data without grep.

---

## Audit — deep, direct-from-source

### 1. What's actually good (do not touch)

- **DB schema**: FK + composite indexes on every hot path. `user_set_stats`
  trigger-maintained (migration 013) so leaderboard aggregation scans
  pre-aggregated rows, not raw `route_logs`
  (`supabase/migrations/013_user_set_stats_materialized.sql:150-154`).
- **RLS helpers**: all `STABLE LANGUAGE sql`, all wrap `auth.uid()` in
  `(select auth.uid())`, all `SECURITY DEFINER` with
  `set search_path = ''` (migration 012).
- **RPC hygiene**: every RPC is marked `STABLE` (or `VOLATILE` only where
  it writes), has explicit `grant execute … to authenticated` + `revoke
  … from anon, public`, and sets `search_path = ''`.
- **`.in()` batching**: no N+1 loops remain. Previous-set routes on the
  profile page use `getRoutesBySetIds` with `.in("set_id", setIds)`
  (`src/lib/data/queries.ts:169-192`).
- **Middleware cookie**: `chork-onboarded` cookie skips the profile read
  per navigation after first check (`src/middleware.ts:37-57`).
- **Request-scoped dedupe**: `getServerUser`, `getServerProfile`, and
  `createServerSupabase` are React `cache()`-wrapped so auth checks
  dedupe within a render (`src/lib/supabase/server.ts:18-69`).
- **Root layout is sync**: deliberately no profile fetch in the layout
  to avoid 400-600ms white screen — good trade-off comment at
  `src/app/layout.tsx:66-80`.
- **LeaderboardView client tab cache**: already in place via component
  state + in-flight dedupe
  (`src/components/Leaderboard/LeaderboardView.tsx:72-74,96`). The v1
  audit incorrectly flagged this as "always cold". It isn't — flipping
  back to a visited tab is instant within the component's lifetime.
- **ClimberSheet dynamic import**: properly lazy-loaded via
  `dynamic(..., { ssr: false })` so the sheet's code isn't paid for on
  every leaderboard render (`LeaderboardView.tsx:16-19`).

### 2. What's actually wrong (prioritised)

#### 2.1 `revalidatePath("/", "layout")` firehose — **worst offender**

`grep -n 'revalidatePath.*"/".*"layout"'` across `src/app` returns
**13 call sites**:

| File:line | Action | Path scope |
|-----------|--------|------------|
| `(app)/actions.ts:105` | `completeRoute` | `/`, layout |
| `(app)/actions.ts:130` | `uncompleteRoute` | `/`, layout |
| `(app)/actions.ts:564` | `switchActiveGym` | `/`, layout |
| `(app)/admin-actions.ts:75` | `assumeGym` / admin op | `/`, layout |
| `(app)/admin-actions.ts:111` | admin op | `/`, layout |
| `admin/actions.ts:244,304,385,413,432` | various (5 calls) | `/`, layout |
| `notifications-actions.ts:26,55` | `markNotificationsRead` | `/`, layout |
| `lib/user-actions.ts:68` | `updateProfile` (username/name) | `/`, layout |
| `onboarding/actions.ts:75` | onboarding complete | `/`, layout (legit) |

In Next 15.2.1, `revalidatePath(path, "layout")` in a server action
invalidates **every route under that layout in the triggering user's
client Router Cache + Full Route Cache + Data Cache**. Because the
matched layout is the app root, `completeRoute` invalidates the user's
cached `/leaderboard`, `/crew`, `/u/*`, `/competitions/*`, `/admin/*`,
etc. — even though the send only affects the climber's own stats, the
set's leaderboard, and their crew activity feeds.

**Concrete user-experienced symptom:** log a send on the wall → tap
the Chorkboard tab → the page refetches from scratch (no router-cache
hit) because the send just killed the entire subtree. That's the
perceived sluggishness.

#### 2.2 Profile page — two serial batches + synchronous aggregation + non-cached auth

`src/app/u/[username]/page.tsx`, 372 lines. Traced end-to-end:

1. Line 62: `createServerSupabase()` — cached, fine.
2. **Line 63: `await supabase.auth.getUser()`** — bypasses the
   `cache()`-wrapped `getServerUser()` in
   `src/lib/supabase/server.ts:47`. Every visit to `/u/{user}` makes a
   fresh auth call even when the same render already has
   `getServerUser()` cached from elsewhere. Same anti-pattern at
   `src/app/profile/page.tsx:10`, `src/app/admin/signup/page.tsx:18`,
   `src/app/admin/invite/[token]/page.tsx:33`,
   `src/app/admin/layout.tsx:22`, `src/app/competitions/[id]/page.tsx:30`.
3. Line 65: `getProfileByUsername` — no cache wrapper. One SQL round trip.
4. Line 85: `await getAllSets(...)` — blocks the entire rest of the page.
5. Lines 91-97: `Promise.all` of 5 queries. OK shape.
6. **Lines 102-275**: heavy **synchronous** JS on the returned payloads —
   build `statsBySet` (line 103), group `logsBySet` (line 125),
   `computeAllTimeAggregates`, `computeSetStreak`, then per-set
   `registerSet()` calls, then `evaluateBadges()` with nested Set lookups,
   then `buildSetCell()` loops. For a climber with ~20 sets and ~400
   cumulative logs this is measurable CPU in the request handler —
   blocks `<Suspense>` streaming (because no Suspense boundary exists).
7. **Lines 294-313: second `Promise.all`** of 6 queries — `getGym`,
   `getLeaderboardUserRow`, `getCrewCountForUser`,
   `getPendingCrewInvites`, `getAdminGymsForUser`, `getNotifications`.
   Of these, **only `getLeaderboardUserRow` needs `activeSet.id`**. The
   other five only need `profileUser.id` and `gymId`, both known at
   line 70. They are blocked by the first batch unnecessarily.
8. No `<Suspense>` boundary anywhere in `page.tsx`. `loading.tsx` only
   paints during the initial nav → when the page's `await`s resolve the
   whole thing flips at once.

#### 2.3 Chorkboard — `getGymStats` fires twice, 8 DB calls per paint

`src/app/leaderboard/page.tsx:27-41`. First `Promise.all`:

- Line 28: `getGym` — 1 round trip
- Line 29: `getCurrentSet` — 1 round trip
- Line 30: `getGymStats(gymId)` — internally **4 parallel round trips**
  (`src/lib/data/queries.ts:591-617`: 1 RPC + 3 count queries)

Second `Promise.all` (awaits the first):

- Line 37: `getLeaderboard` — 1 RPC call
- Line 38: `getLeaderboardUserRow` — 1 RPC call
- Line 39: `getGymStats(gymId, setId)` — another **4 parallel round
  trips** (set-scoped variant, `queries.ts:562-588`)
- Line 40: `getRoutesBySet` — 1 round trip

Conditional third: `getLeaderboardNeighbourhood` for ranked users
(line 47) — sequential after rank is known, another waterfall.

**Total: 14 Supabase round trips per cold leaderboard paint, plus up to
1 more for neighbourhood.** All are fast individually (< 30ms warm
each), but the doubled `getGymStats` is pure waste — the same 4 counts
scoped twice. A single RPC returning both scopes in one shot cuts 7
round trips.

#### 2.4 Profile page's `getAllRouteDataForUserInGym` does the wrong split of work

`src/lib/data/queries.ts:227-283`: fetches raw logs + route count in
parallel, returns raw rows. The aggregation into per-set stats then
happens **in the request handler** (`page.tsx:102-122` loop). For a
climber with a long history this is:

- Large payload from Postgres (every log row)
- Every log row serialized through PostgREST → JSON → JS object
- A for-loop in the handler building the aggregate

The `user_set_stats` materialised view already has exactly these
aggregates per (user, set). We should read those rows directly
(`sends`, `flashes`, `zones`, `points` per set) and skip the log-level
fetch on the profile page. Raw logs are only needed for the `PunchTile`
per-route status grid (active set only) and for badge evaluation of
condition-based achievements that check specific route numbers.

Proposed RPC `get_profile_summary(p_user_id, p_gym_id)` returns, in
one call:

- Per-set aggregates (from `user_set_stats`): `set_id`, `sends`,
  `flashes`, `zones`, `points`
- Active-set detail: route_ids the climber has attempted/flashed/zoned
  (for the mini-grid + active-set badge context)
- `total_routes_in_gym` count

The page becomes: active-set mini-grid from the active-set detail, all
other per-set cells from the aggregates. Badge evaluation still runs
against `completedRoutesBySet`/`flashedRoutesBySet` populated from the
active-set detail + per-set aggregate (count-only suffices for
count-based badges).

#### 2.5 No shared server cache — identical work repeats per viewer

Grep for `unstable_cache(`: zero hits. For the leaderboard specifically,
with `user_set_stats` as input the RPC is cheap (maybe 20-50ms warm
for a 1k-member gym), but it still runs once per viewer per refresh.
100 climbers checking the board during an evening session at one gym
= 100 identical DENSE_RANK computations. Shared server cache keyed on
`(gym_id, set_id)` + tag `set:{id}:leaderboard` → first request warms,
next 99 hit cache; one completion busts the tag, next read recomputes
once for everybody.

Same logic applies to: `getGym`, `getListedGyms`, `getCurrentSet`,
`getAllSets`, `getRoutesBySet`, `getProfileByUsername`,
`getCompetitionById`.

#### 2.6 Heavy synchronous badge evaluation blocks `completeRoute` return

`src/app/(app)/actions.ts:95-104`: after writing the log, the action
synchronously runs `buildBadgeContext` + `evaluateAndPersistAchievements`
before returning. Badge evaluation reads multiple tables. User sees
that latency as "tile flip delay" after tapping complete.

Next 15 exposes `after()` from `next/server` — post-response work that
runs in the request's runtime without blocking the return. Moving
badge evaluation into `after(...)` lets the action return as soon as
the log + activity event are written, cutting perceived send latency.
Badge state catches up asynchronously; the UI already handles
achievements appearing a moment later.

#### 2.7 Two ad-hoc client caches — not a bug, but inconsistent

- `src/components/SendsGrid/SendsGrid.tsx:31` — module-level `Map`
  holding `{ grade, comments, likedIds }` per route. No TTL, lives
  until page reload.
- `src/components/Leaderboard/ClimberSheet.tsx:32-51` — module-level
  `Map` with 30s TTL.

Both work. Neither is wrong. But they're inconsistent — two different
hand-rolled cache shapes, two ad-hoc eviction policies. If we don't
need more, keep them as-is. If we add a third similar case, unify
them into one tiny hook (~60 lines). **v1 overweighted this as "Phase 4"
— it's now a nice-to-have.**

#### 2.8 Competition page double-fetch

`src/app/competitions/[id]/page.tsx`: `generateMetadata` calls
`getCompetitionById` (line 21 area), page body calls the same helper
later. Both fire SQL because the helper isn't `cache()`-wrapped.
Trivial fix: wrap in React `cache()`.

#### 2.9 `staleTimes.dynamic = 300` is aggressive

`next.config.ts:78`. 5 minutes is double the Next docs' own example
(`dynamic: 30`). With current `revalidatePath("/", "layout")` practice
the 5-minute window is constantly being broken by other actions anyway,
so the current value is effectively "whatever the last mutation reset
it to". Once tag-based revalidation lands, the value becomes
meaningful — 30-60s is a better default. High enough to cover tab
switches within an active session, low enough that other users' writes
appear without a hard refresh.

### 3. What v1 got wrong

- **"Tab switches always cold-fetch"** — false. LeaderboardView caches
  tabs in component state. Correct concern: on unmount/remount (page
  nav away and back) the cache is gone. `staleTimes.dynamic` papers
  over that today; tag-revalidation does once we switch.
- **"ClimberSheet peek is a full SQL join every first tap"** — true,
  but it's already reading from a selective index and the join is
  tiny (logs for one user in one set). Not a scaling concern. OK as-is.
- **"Unified client query cache"** — overscoped. Only two call sites
  exist and both already work. Drop to optional polish, not a phase.
- **v1 didn't mention `after()` for badge evaluation** — meaningful
  perceived-latency win that belongs in the plan.
- **v1 didn't mention the direct `supabase.auth.getUser()` calls that
  bypass `getServerUser()`** — trivial cleanup with a measurable
  benefit on auth-heavy renders.

---

## Architecture — six concentric freshness layers

Each layer has exactly one tool. Anything needing cache → figure out
which layer, use that layer's tool, end of story.

| Layer | Tool | Lives for | Shared across users? |
|-------|------|-----------|----------------------|
| 1. DB | Postgres + triggers | forever | yes |
| 2. **Server cache** (NEW) | `unstable_cache` + tags | TTL or tag bust | **yes** |
| 3. Per-render | React `cache()` | one render | no |
| 4. **Streaming** (NEW) | `<Suspense>` | per request | no |
| 5. Post-response | `after()` | per request, after return | no |
| 6. Client hints + caches | `<Link prefetch>`, `<Image priority>`, existing Maps | browser session | no |

`unstable_cache` is marked deprecated in Next 16, but we're staying on
15.2.1 this sprint (see decision log). Migration to Next 16's
`"use cache"` directive is a separate ~1-day sprint after this lands;
the mental model is identical (key + tags + TTL → stable cache entry).

### Layer 1 — DB (unchanged except for two new RPCs)

**`get_profile_summary(p_user_id uuid, p_gym_id uuid) returns jsonb`**
Returns one JSON blob:

```json
{
  "per_set": [
    { "set_id": "...", "sends": 12, "flashes": 3, "zones": 5, "points": 42 },
    ...
  ],
  "active_set_detail": [
    { "route_id": "...", "attempts": 1, "completed": true, "zone": false },
    ...
  ],
  "total_routes_in_gym": 240
}
```

Implementation reads from `user_set_stats` for `per_set`, from
`route_logs` joined on `routes` for `active_set_detail`, and from a
count aggregate for `total_routes_in_gym`. `STABLE SECURITY DEFINER
set search_path = ''`. Gate: `is_gym_member(p_gym_id)`.

**`get_gym_stats(p_gym_id uuid, p_set_id uuid default null) returns jsonb`**
Returns:

```json
{
  "all_time": { "climbers": 142, "sends": 8821, "flashes": 1103, "routes": 246 },
  "set": { "climbers": 57, "sends": 310, "flashes": 42, "routes": 20 } // or null
}
```

One RPC body with two `WITH` CTEs; if `p_set_id` is null, returns
`set = null`. Replaces the 8 round trips on `/leaderboard` with 1.

Both are pure reads of existing tables, no new trigger load.

### Layer 2 — Server cache (`unstable_cache` + tags)

Typed wrapper enforces tag taxonomy:

```ts
// src/lib/cache/cached.ts
import { unstable_cache } from "next/cache";

export type Tag =
  | `gym:${string}`
  | `gym:${string}:active-set`
  | `set:${string}:routes`
  | `set:${string}:leaderboard`
  | `user:${string}:profile`
  | `user:${string}:stats`
  | `user:${string}:crews`
  | `user:${string}:notifications`
  | `crew:${string}`
  | `gyms:listed`
  | `competition:${string}`;

export function cachedQuery<A extends unknown[], R>(
  keyParts: string[],
  fn: (...args: A) => Promise<R>,
  opts: { tags: Tag[]; revalidate: number },
) {
  return unstable_cache(fn, keyParts, opts);
}
```

**Wrapping plan — the 11 hot helpers:**

| Helper | Key | Tags | TTL (s) |
|--------|-----|------|---------|
| `getGym(gymId)` | `['gym', gymId]` | `gym:{id}` | 3600 |
| `getListedGyms()` | `['gyms-listed']` | `gyms:listed` | 3600 |
| `getCurrentSet(gymId)` | `['set-active', gymId]` | `gym:{id}:active-set` | 60 |
| `getAllSets(gymId, sinceIso?)` | `['sets', gymId, sinceIso ?? '*']` | `gym:{id}:active-set` | 300 |
| `getRoutesBySet(setId)` | `['routes', setId]` | `set:{id}:routes` | 300 |
| `getRouteGrade(routeId)` | `['route-grade', routeId]` | `set:{id}:routes` (via lookup) | 300 |
| `getProfileByUsername(u)` | `['profile-by-username', u]` | `user:{uid}:profile` | 300 |
| `getLeaderboardSet(gymId, setId, limit, offset)` | `['lb-set', …]` | `set:{id}:leaderboard` | 60 |
| `getLeaderboardAllTime(gymId, limit, offset)` | `['lb-all', gymId, limit, offset]` | `gym:{id}` | 60 |
| `getGymStatsV2(gymId, setId?)` | `['gym-stats', gymId, setId ?? '*']` | `gym:{id}`, `set:{id}:leaderboard` (when set-scoped) | 60 |
| `getCompetitionById(id)` | `['comp', id]` | `competition:{id}` | 300 |

Key subtleties:

- **`getRouteGrade` tag is `set:{id}:routes`** where `{id}` is the set
  containing the route. Cache key is `routeId` (stable), tag is
  derived. One query can have multiple tags. When a route's grade
  updates we bust that set's tag.
- **`getProfileByUsername` cache key is the username** (what the page
  passes), but the tag is `user:{uid}:profile` where uid is the
  resolved id. So when user X changes their username, revalidating
  `user:X:profile` invalidates the old-username cache entry because
  both old and new entries carry the same tag.
- **Per-user tags scale with users, not with cache entries**. 50k
  users → 50k distinct tags are fine; Next keeps only the tags actually
  in use in memory.

### Layer 3 — Per-render React `cache()`

Keep as-is for supabase/server helpers. **Add two:**

- `getProfileByUsername` (separately from the server-cache wrap — so
  within a render, any caller that fetches by username with the same
  value dedupes; server-cache wrap makes it shared across renders.
  Both layers compose).
- `getCompetitionById` (fixes §2.8 double fetch).

**Also: replace all direct `supabase.auth.getUser()` calls in server
components with `getServerUser()`** (§2.2). 6 files, one-line changes.

### Layer 4 — Streaming Suspense

**`/u/[username]` split into streamed segments** (addresses §2.2 +
§2.4):

```tsx
// page.tsx — shell
export default async function Page({ params }) {
  const { username } = await params;
  const profileUser = await getProfileByUsername(supabase, username);
  if (!profileUser) notFound();

  return (
    <main className={styles.page} {...themeAttrForUser(profileUser)}>
      <ProfileHeaderStatic user={profileUser} />
      {/* Above: header paints as soon as profile row resolves */}
      <Suspense fallback={<StatsCardSkeleton />}>
        <ProfileStats userId={profileUser.id} gymId={profileUser.active_gym_id} isOwn={isOwn} />
      </Suspense>
      <Suspense fallback={<AchievementsSkeleton />}>
        <ProfileAchievementsSection userId={profileUser.id} gymId={profileUser.active_gym_id} />
      </Suspense>
      <Suspense fallback={<SetsGridSkeleton />}>
        <PreviousSetsSection userId={profileUser.id} gymId={profileUser.active_gym_id} />
      </Suspense>
      {isOwn && (
        <Suspense fallback={null}>
          <OwnProfileExtras userId={profileUser.id} />
          {/* invites + notifications + admin check */}
        </Suspense>
      )}
    </main>
  );
}
```

Each streamed child is its own async server component that calls
`get_profile_summary` (shared via React `cache()` across siblings so
`ProfileStats` + `ProfileAchievementsSection` + `PreviousSetsSection`
use one DB round trip). Heavy JS aggregation moves INTO those
components so it's off the shell's critical path.

**`/leaderboard`**: neighbourhood streams below the top-5:

```tsx
{/* sync: top + userRow rendered immediately */}
<Suspense fallback={<NeighbourhoodSkeleton />}>
  <NeighbourhoodSection gymId={gymId} userId={userId} setId={setId} rankHint={userRow.rank} />
</Suspense>
```

The sync render no longer awaits neighbourhood; the user's own row
renders from the already-fetched `userRow`, and the surrounding
climbers stream.

### Layer 5 — Post-response `after()`

```ts
import { after } from "next/server";

export async function completeRoute(...) {
  // ...write log + activity event...
  revalidateTag(...);
  after(async () => {
    try {
      const ctx = await buildBadgeContext(supabase, userId, gymId);
      if (ctx) await evaluateAndPersistAchievements(supabase, userId, ctx);
    } catch (err) { console.error("[achievements]", err); }
  });
  return { success: true, log };
}
```

Action returns as soon as the log + activity event + revalidation
complete. Badge persistence catches up within milliseconds, UI picks
it up on next `/u/{username}` paint (or via push if achievement is
push-worthy).

### Layer 6 — Client hints + existing Maps

- `<UserAvatar priority />` on `/u/{username}` header + top-3 Podium
  entries (above-the-fold in both cases).
- Default `<Link prefetch>` stays everywhere — it's already on.
- **Keep** `routeDataCache` (SendsGrid) and `climberSheetCache`
  (ClimberSheet) as-is. Not worth unifying for two call sites that
  work. If a third appears, unify then.

---

## Targeted revalidation map

Replacing `revalidatePath("/", "layout")` scorch with tag calls.
Each mutation table entry: what changed in DB → what tags bust → who
notices.

| Mutation | DB change | Tags to revalidate | Notes |
|----------|-----------|--------------------|-------|
| `completeRoute` / `uncompleteRoute` | `route_logs` row ± trigger updates `user_set_stats` | `set:{setId}:leaderboard`, `user:{userId}:stats`, `user:{userId}:profile` | `setId` resolved from route. `profile` tag busts cached profile-summary for the climber. |
| `toggleZone` | `route_logs.zone` | none (no completion change; points via trigger → via leaderboard bust); optimistic UI only today | Keep no revalidation — already the case. |
| `updateAttempts` | `route_logs.attempts` | none (no completion change) | Keep no revalidation. |
| `updateGradeVote` | `route_logs.grade_vote` + trigger → `routes.community_grade` | `set:{setId}:routes` | Community grade moved. |
| `postComment` | `comments` row + `activity_events` | `crew:{...}` per member who sees the feed — in practice just `revalidatePath("/crew")` stays | Comments aren't in the server cache layer (Phase 1), so a tag call wouldn't do anything. Leave `revalidatePath("/crew")` in place. Revisit if we ever server-cache comments. |
| `likeComment` | `comments.likes` + `comment_likes` row | none | Optimistic UI, result in the action payload. Already no revalidate. |
| `switchActiveGym` | `profiles.active_gym_id` + maybe `gym_memberships` | `user:{userId}:profile` | The user's active gym changed; pages keyed on `active_gym_id` need a fresh read for them only. Other users unaffected. |
| `updateProfile` (username/name) | `profiles.username` / `.name` | `user:{userId}:profile` | Username change also needs the cache entry keyed on old username busted — handled because the tag is resolved by uid not username. |
| `updateTheme` | `profiles.theme` | `user:{userId}:profile` | |
| `joinCompetition` / `leaveCompetition` | `competition_participants` | `competition:{competitionId}` | Already targeted. |
| `joinCrew` / `inviteToCrew` / `acceptInvite` / `declineInvite` / `leaveCrew` / `transferOwnership` | `crew_members` / `crews` / `notifications` | `crew:{crewId}` + `user:{uid}:crews` for each affected member + `user:{uid}:notifications` for recipients of push-log events | Per-member fan-out is explicit in each action — memberUserIds are already known locally. |
| `markNotificationsRead` | `notifications.read_at` | `user:{userId}:notifications` | Today uses `revalidatePath("/", "layout")` — unnecessary nuke. |
| Admin: `createSet` / `updateSet` / `archiveSet` / set going live | `sets` row (± `sets_sync_active` trigger) | `gym:{gymId}:active-set`, `set:{setId}:routes` (if routes changed) | Today uses double `revalidatePath("/admin", "layout")` + `"/"`. |
| Admin: `createRoute` / `updateRoute` / `deleteRoute` | `routes` row | `set:{setId}:routes` | |
| Admin: `linkCompetitionGym` / `unlinkCompetitionGym` | `competition_gyms` | `competition:{competitionId}` | |
| Admin: `resolveAdminInvite` (admin invite accept) | `gym_admins` + `profiles` | `user:{userId}:profile` | |
| Onboarding finish | `profiles.onboarded` + maybe `profiles.active_gym_id` | **KEEP `revalidatePath("/", "layout")`** | Legitimate full-tree revalidation — user transitions from onboarding route into the app. Router cache wipe is the correct behaviour here. |

Acceptance: after Phase 2, `grep -n 'revalidatePath.*"/".*"layout"'
src/app` shows one result (`onboarding/actions.ts:75`).

---

## Phased rollout

Each phase is independently shippable. Tests pass at the end of each
phase. Phases 0-3 capture 90% of the user-facing win.

### Phase 0 — DB consolidation (1 migration, 2 RPCs)

- Add `get_profile_summary` + `get_gym_stats` (new signature).
- Regenerate `database.types.ts`.
- Add typed wrappers `getProfileSummary`, `getGymStatsV2` in
  `src/lib/data/queries.ts`.
- Do **not** remove the old helpers in this phase — let their callers
  migrate in later phases.
- Tests: RPC gate (non-member returns empty), payload shape, points
  formula parity with `computePoints` in `src/lib/data/logs.ts`.

### Phase 1 — Trivial-win cleanups

Three unrelated cleanups, all low-risk:

1. Replace 6 direct `supabase.auth.getUser()` calls with
   `getServerUser()` in: `u/[username]/page.tsx:63`,
   `profile/page.tsx:10`, `admin/signup/page.tsx:18`,
   `admin/invite/[token]/page.tsx:33`, `admin/layout.tsx:22`,
   `competitions/[id]/page.tsx:30`.
2. `React.cache()`-wrap `getProfileByUsername` +
   `getCompetitionById`.
3. Wrap `completeRoute` badge evaluation in `after()`
   (`(app)/actions.ts:96-103`).

### Phase 2 — Server cache layer

- `src/lib/cache/cached.ts` with `Tag` type + `cachedQuery` wrapper.
- Wrap the 11 helpers in the table above.
- Update `/leaderboard` to use the new `getGymStatsV2` (single call
  replaces the two-call pattern at `page.tsx:30` and `:39`).
- Document the tag taxonomy in `docs/architecture.md`.
- **Mutations unchanged in this phase.** The server cache refreshes
  only on TTL (max 60s for leaderboard, 300s for routes, 3600s for
  gym metadata). This intermediate state is intentional: the cache
  can't serve stale data beyond its TTL even if a mutation forgets to
  bust the tag, so Phase 2 is safe to ship alone.
- Tests: cache key stability, tag type compile-time exhaustiveness,
  one integration test confirming a second identical request hits the
  cache (via a stub'd DB that counts calls).

### Phase 3 — Targeted tag revalidation

- Audit every `revalidatePath` call and replace per the table above.
- Leave `revalidatePath("/crew")` on `postComment`, and
  `revalidatePath("/", "layout")` on `onboarding/actions.ts:75`.
- Delete any remaining `revalidatePath("/admin", "layout")` after
  moving admin mutations to tagged revalidation.
- Tests: each mutation test now asserts which tags were revalidated,
  not which paths. (Mock `revalidateTag` alongside existing
  `revalidatePath` mock.)
- Acceptance: grep check above returns 1 hit.

### Phase 4 — Profile page streaming + summary migration

- Restructure `src/app/u/[username]/page.tsx` as shell + 3-4 Suspense
  boundaries (see Layer 4 sketch).
- `ProfileStats`, `ProfileAchievementsSection`, `PreviousSetsSection`,
  `OwnProfileExtras` become async server components, each fetching via
  `getProfileSummary` (server-cache wrapped + per-render React cache
  → single DB trip shared across siblings).
- Delete client-side aggregation loops from `page.tsx:102-275`; move
  the small per-set badge evaluation that needs active-set route
  numbers into `PreviousSetsSection` where the raw-log detail is
  already needed.
- Skeletons match the final layout — no CLS. Stories added for each
  skeleton in Storybook.
- Leaderboard: move neighbourhood fetch into a streamed component
  below the top-5.
- Tests: Playwright smoke test confirming `<ProfileHeaderStatic>`
  renders before the streamed children finish mounting (check via the
  streaming HTML chunks).

### Phase 5 — `staleTimes` tune + avatar priority

- Lower `experimental.staleTimes.dynamic` from 300 → 60 in
  `next.config.ts`. With Phase 3 in place, mutations invalidate only
  the specific tags' consumer routes; 60s is a better balance between
  "snappy within my session" and "see other users' updates soon".
- `priority` prop wired through `UserAvatar` and set true on
  `ProfileHeader`'s avatar + top-3 `Podium` entries.
- Memoise `ProfileHeader` + `LeaderboardView` with `React.memo` and
  explicit comparators if profiling shows re-render churn (gate on
  measurement — don't memoise pre-emptively).

### Phase 6 — Optional polish (skip if no measured pain)

- Unify `routeDataCache` + `climberSheetCache` into one tiny hook if
  a third call site appears.
- `router.prefetch` on leaderboard row hover/touchstart.
- Lighthouse + WebPageTest on `/u/{username}` and `/leaderboard` to
  confirm acceptance criteria.

---

## Non-goals (explicit)

- **No Redis / external cache.** `unstable_cache` suffices at current
  scale. Revisit if Vercel edge cache proves insufficient.
- **No SWR / React Query.** Two client Maps is not enough to justify
  a dependency.
- **No service-worker data caching.** Shell caching stays as-is;
  adding SW data caching would create a second invalidation source
  that conflicts with `revalidateTag`.
- **No new denormalisations.** `user_set_stats` covers what we need;
  `community_grade` is already denormalised. Avoid trigger-piling.
- **No Next 16 upgrade this sprint.** Separate follow-up sprint.
  All `unstable_cache` usage here migrates mechanically to
  `"use cache"` in Next 16 — key + tags + TTL translate one-for-one.
- **No `cacheComponents` / PPR / `"use cache"` directive**. Those
  are 16-era work. Locked on `unstable_cache` for now.
- **No `fetch(..., { next: { tags } })` pattern.** We don't fetch
  external APIs; all data goes through Supabase client methods which
  don't participate in that system. `unstable_cache` is our equivalent.

---

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `revalidateTag` in a server action doesn't invalidate router cache as advertised in some edge case | low | stale UI post-action for one nav | Short TTLs (60s on hot paths). Add a `router.refresh()` call in mutation handlers if it becomes a problem. |
| A mutation forgets a tag | medium | up to one TTL period of stale read | Keep TTLs short on the hot tags. Add a lint rule later if it's recurrent. |
| `get_profile_summary` semantics drift from the JS aggregation it replaces | medium | wrong points/stats on profile | Parity test: feed same `route_logs` into the RPC and the existing JS aggregation, assert equal output for 100 random climbers in staging. |
| `after()` swallows badge evaluation errors quietly | low | stale badges | Already logged in current code; `after` keeps the log. Monitor error rate. |
| Tag-based cache entries leak per-user (too many distinct user tags) | low | memory growth on Vercel function instance | `unstable_cache` entries are per-key, not per-tag — a user-scoped tag just means that user's entries can be invalidated together. No explosion. |
| Lower `staleTimes.dynamic` (300→60) makes client feel chattier | low | more server round trips on rapid nav | 60s is still enough for normal "flip between tabs, come back" patterns. Measure post-ship; bump to 120 if felt. |

---

## Acceptance criteria — mapped to phases

| # | Criterion | Phase | How measured |
|---|-----------|-------|--------------|
| 1 | Profile shell paint < 400ms warm | 4 | WebPageTest / Lighthouse |
| 2 | Chorkboard cold paint ≤ 5 Supabase round trips | 2 | Count in Supabase dashboard query log during single /leaderboard hit |
| 3 | N concurrent leaderboard viewers → 1 DB compute per mutation | 2 | Load test: 20 users refresh /leaderboard, observe one RPC hit in pg stats |
| 4 | `grep -n 'revalidatePath.*"/".*"layout"' src/app` returns 1 hit | 3 | Repo grep |
| 5 | `completeRoute` action round trip < 300ms p50 | 1 | Timing on staging, bench-log |
| 6 | `docs/architecture.md` answers "where does X cache" for any helper | 2 | Self-review after write-up |

All phases gated on: `pnpm test --run` green, `pnpm next lint` green,
`pnpm build` green, no Storybook regressions.
