# Unified Loading + Caching Strategy

**Date:** 2026-04-16
**Status:** Design — pending implementation plan

## Goal

Make Chork feel snappy on navigation and profile reveal, and cut redundant
database load so the app scales when many users view the same leaderboard
concurrently. Achieve this via a single coherent caching architecture that
replaces the current mix of path revalidation, ad-hoc client Maps, and
blocking renders.

Success criteria:

1. `/u/[username]` first contentful paint under 400ms on a warm cache; shell
   visible immediately on cold navigation.
2. `/leaderboard` tab switches (This set ↔ All time) are instant on revisit.
3. A single leaderboard viewed by N concurrent users costs **one DB
   aggregation per relevant mutation**, not N reads on every refresh.
4. Mutations revalidate only what they affect — no more
   `revalidatePath("/", "layout")` nukes.
5. One documented pattern for every layer of freshness. A new contributor
   reading `docs/architecture.md` can answer "where does this data live and
   when does it go stale?" in under a minute.

---

## Current state (summary of audit)

**Already excellent — keep:**

- DB schema, FK + composite indexes on hot paths
- RLS helpers (`STABLE`, `LANGUAGE sql`, `(select auth.uid())` wrapping)
- RPC hygiene (`STABLE`, `search_path = ''`, explicit grants)
- `.in()` batching replaces all N+1 patterns
- `user_set_stats` materialized view + `routes.community_grade` triggers
- Middleware onboarded cookie (skips per-nav profile read)
- React `cache()` on `getServerUser` / `getServerProfile` / `createServerSupabase`

**Problems (from audit):**

- **Zero `unstable_cache` / `revalidateTag`** — every mutation uses
  `revalidatePath`. Many use `revalidatePath("/", "layout")` which blows
  away the entire client RSC stale-times cache.
- **`/u/[username]` waterfall** — profile → sets → queries run in two
  sequential `Promise.all` batches. `getAllRouteDataForUserInGym` returns
  heavy JSON that is re-aggregated in JS. No Suspense streaming. Four
  `"use client"` components (448+ lines) hydrate on first paint.
- **`/leaderboard`** — `getGymStats` fires twice (once all-time, once
  set-scoped), neighbourhood query waterfalls on rank for ranked users,
  tab switches always cold-fetch.
- **Two ad-hoc client caches**: `routeDataCache` (no TTL) and
  `climberSheetCache` (30s hardcoded). No unified pattern.
- **Avatars** on profile header + leaderboard use default (lazy) loading.
- **Service worker** caches shell only, never data responses.
- **`getCompetitionById`** called twice per render (metadata + page body).

---

## Architecture — 6 concentric freshness layers

Each layer has exactly one tool. A contributor asking "where does X cache?"
finds one answer.

| Layer | Tool | Lives for | Shared across users? |
|-------|------|-----------|----------------------|
| 1. DB | Postgres + triggers | forever | yes |
| 2. Server cache | `unstable_cache` + tags | minutes–hours | **yes** |
| 3. Per-render | React `cache()` | one render | no |
| 4. Streaming | `<Suspense>` + `loading.tsx` | per request | no |
| 5. Client query cache | hand-rolled `useCachedQuery` hook | browser session | no |
| 6. Browser hints | `<Link prefetch>` + `<Image priority>` | browser | no |

### Layer 1 — DB (unchanged)

Already good. Two small additions under Phase 0:

- `get_profile_summary(p_user_id uuid, p_gym_id uuid) returns jsonb` —
  returns all per-set aggregates (sends, flashes, zones, points, set name,
  grading scale, ends_at) in one round-trip. Replaces
  `getAllRouteDataForUserInGym` + client-side reduce loop.
- `get_gym_stats(p_gym_id uuid, p_set_id uuid default null) returns
  jsonb` — if `p_set_id` is null, returns all-time only; if provided,
  returns both scopes in one call. Replaces the current double-call
  pattern in `/leaderboard`.

Both `STABLE SECURITY DEFINER set search_path = ''`, granted to
`authenticated`, gated by `is_gym_member(p_gym_id)`.

### Layer 2 — Server cache (`unstable_cache` + tags)

A thin wrapper enforces the tag taxonomy:

```ts
// src/lib/cache/cached.ts
export function cachedQuery<Args extends unknown[], Result>(
  keyParts: string[],
  fn: (...args: Args) => Promise<Result>,
  opts: { tags: Tag[]; revalidate: number },
): (...args: Args) => Promise<Result>
```

`Tag` is a string-template type forcing the taxonomy:

```ts
type Tag =
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
  | `competition:${string}`
```

**Wrapped helpers (Phase 1 targets):**

| Helper | Key | Tags | TTL |
|--------|-----|------|-----|
| `getGym(gymId)` | `['gym', gymId]` | `gym:{id}` | 3600s |
| `getListedGyms()` | `['gyms-listed']` | `gyms:listed` | 3600s |
| `getCurrentSet(gymId)` | `['set-active', gymId]` | `gym:{id}:active-set` | 60s |
| `getAllSets(gymId, since?)` | `['sets', gymId, since ?? 'all']` | `gym:{id}:active-set` | 300s |
| `getRoutesBySet(setId)` | `['routes', setId]` | `set:{id}:routes` | 300s |
| `getRouteGrade(routeId)` | `['route-grade', routeId]` | `set:{id}:routes` | 300s |
| `getProfileByUsername(u)` | `['profile-by-username', u]` | `user:{id}:profile` | 300s |
| `getLeaderboardSet(gymId,setId,limit,offset)` | `['lb-set', …]` | `set:{id}:leaderboard` | 60s |
| `getLeaderboardAllTime(gymId,limit,offset)` | `['lb-all', …]` | `gym:{id}` | 60s |
| `getGymStats(gymId, setId?)` | `['gym-stats', …]` | `gym:{id}`, `set:{id}:leaderboard` | 60s |
| `getCompetitionById(id)` | `['comp', id]` | `competition:{id}` | 300s |

**Why this is the biggest scaling win:** today, 100 climbers reopening the
Chorkboard after lunch = 100 full aggregation queries. With server cache
keyed on `(gymId, setId)` and tagged `set:{id}:leaderboard`, the first
request warms the cache and the next 99 are served from memory; a single
new route log busts the tag and the next read recomputes once for
everybody.

**Per-user-tagged entries** (profile, crews, notifications) still share the
cached value across any viewer who hits that user's profile, so a crew
teammate and a random climber loading the same profile page both hit one
cached row.

### Layer 3 — Per-render React `cache()`

Keep as-is for `createServerSupabase` / `getServerUser` / `getServerProfile`.
Add:

- `getProfileByUsername` (used by page body + `generateMetadata`)
- `getCompetitionById` (same reason — fixes the 2× fetch bug directly)

### Layer 4 — Streaming Suspense

Route changes:

- **`/u/[username]`** — split `page.tsx`:
  - Shell (sync): avatar (with `priority`), username, gym, crew button
  - `<Suspense fallback={<StatsSkeleton />}>` → `<ProfileStats />` server
    component calling `get_profile_summary` RPC
  - `<Suspense fallback={<RingsSkeleton />}>` → `<ActivityRings />`
  - `<Suspense fallback={<BadgesSkeleton />}>` → `<BadgeShelf />`
- **`/leaderboard`** — keep top-5 sync; neighbourhood streamed under
  Suspense below (unblocks paint for ranked users)
- **`/competitions/[id]`** — rely on the `cache()` dedupe above; no
  structural change needed

### Layer 5 — Unified client query cache

`src/lib/client/useCachedQuery.ts` — ~80 lines, hand-rolled:

```ts
useCachedQuery<T>(
  key: string,         // stable serialisation of inputs
  fetcher: () => Promise<T>,
  opts?: { ttl?: number; staleWhileRevalidate?: boolean },
): { data: T | undefined; loading: boolean; error: Error | null }
```

Single module-level Map backs every caller. Entries carry
`{ data, fetchedAt, inflight }`. SWR semantics: within TTL serve cached;
past TTL with `staleWhileRevalidate` serve cached AND refetch in
background; otherwise refetch blocking. Inflight promise is memoised so
two callers with the same key coalesce.

Replaces:

- `routeDataCache` in `SendsGrid` → `useCachedQuery(['route', routeId], …, { ttl: 300_000 })`
- `climberSheetCache` in `ClimberSheet` → same hook, `ttl: 30_000`
- `LeaderboardView` tab state → wraps `fetchLeaderboardTab(setId)` so
  flipping back to a visited tab is instant

No new dependencies.

### Layer 6 — Browser hints

- `<UserAvatar priority />` on `/u/[username]` header and top-3 podium
  entries on Chorkboard
- Default `<Link prefetch>` stays on everywhere (already is)
- Touch-hover pre-warm on leaderboard rows: `onMouseEnter`/`onTouchStart`
  fires a `router.prefetch(...)` for `/u/[username]` (the server cache
  keeps this cheap on a warm gym)

---

## Phased rollout

Each phase is independently shippable, independently revertable, and each
phase leaves the app in a working state.

### Phase 0 — DB consolidation RPCs

- Migration: add `get_profile_summary` + `get_gym_stats` (new signature)
- Regenerate `database.types.ts`
- Add typed wrappers in `src/lib/data/queries.ts`
- Keep old helpers (`getAllRouteDataForUserInGym`, single-scope
  `getGymStats`) in place — unused callers can migrate in Phase 1/3
- Tests: RPC auth gate + payload shape

### Phase 1 — Server cache + tag layer

- `src/lib/cache/cached.ts` — wrapper + Tag type
- Wrap the 11 helpers in the table above
- No mutation changes yet. `revalidatePath` does **not** bust
  `unstable_cache` tag entries, so during Phase 1 the server cache only
  refreshes on its TTL expiry. This intermediate state is safe (worst
  case: users see data up to 60s stale on the leaderboard, 300s on
  routes, 3600s on gym metadata — all acceptable). Full benefit lands
  once Phase 2 completes.
- Add `docs/architecture.md` section documenting the tag taxonomy
- Tests: cache key stability + tag shape

### Phase 2 — Targeted `revalidateTag` in mutations

Audit every `revalidatePath` call, map to tag revalidations:

| Mutation | Old | New |
|----------|-----|-----|
| route log complete/uncomplete | `revalidatePath("/", "layout")` | `revalidateTag('set:{id}:leaderboard')`, `revalidateTag('user:{uid}:stats')`, `revalidateTag('user:{uid}:profile')` |
| gym switch | `revalidatePath("/", "layout")` | `revalidateTag('user:{uid}:profile')` only (user's active_gym_id changed — other data is still valid per-gym) |
| crew mutations | `revalidatePath("/crew", "layout")` | `revalidateTag('crew:{id}')` + `revalidateTag('user:{uid}:crews')` for every affected member (invite accept touches both parties; member leave touches leaver + remaining roster only if roster-level caches change) |
| comment post | `revalidatePath("/crew")` | keep as-is — comments are not server-cached in Phase 1; fetched client-side via `useCachedQuery` once Phase 4 lands |
| admin set/route mutations | `revalidatePath("/", "layout")` | `revalidateTag('set:{id}:routes')`, `revalidateTag('gym:{id}:active-set')` if status changed |
| notifications mark-read | `revalidatePath("/", "layout")` | `revalidateTag('user:{uid}:notifications')` |
| onboarding finish | `revalidatePath("/", "layout")` | keep — genuinely needs full reroute |

Acceptance: no `revalidatePath("/", "layout")` call remains except
onboarding finish.

### Phase 3 — Streaming Suspense

- Restructure `src/app/u/[username]/page.tsx` into shell + streamed
  children
- Move stats computation into a server component that calls
  `get_profile_summary`
- Add neighbourhood Suspense on `/leaderboard`
- `generateMetadata` on `/competitions/[id]` relies on per-render
  `cache()` wrapper from Layer 3
- Skeletons match the layout (no CLS)
- Tests: skeleton render in Storybook, Playwright smoke for streamed
  children mounting

### Phase 4 — Unified client query cache

- Build `useCachedQuery` hook + module-level store
- Migrate `SendsGrid` (`routeDataCache`)
- Migrate `ClimberSheet` (`climberSheetCache`)
- Migrate `LeaderboardView` tab state
- Delete the old Maps and their wrappers
- Tests: unit tests for hook (cache hit, TTL miss, SWR refetch, coalesce,
  error)

### Phase 5 — Browser hints + client memoisation

- `UserAvatar priority` prop plumbed through `ProfileHeader`, `Podium`
- `router.prefetch` on leaderboard row hover/touchstart
- Wrap `ProfileHeader`, `ClimberStats`, `PreviousSetsGrid`,
  `LeaderboardView` in `React.memo` with explicit prop comparators where
  helpful
- Lighthouse pass on `/u/[username]`

---

## Non-goals (explicit YAGNI)

- No Redis / external cache. `unstable_cache` + Next's per-instance cache
  is enough at current scale; revisit if Vercel edge cache proves
  insufficient.
- No React Query / SWR dependency. Hand-rolled hook is ~80 lines; the
  use cases are narrow (3 call sites).
- No service-worker data caching. Shell caching stays as-is; adding SW
  data caching conflicts with the `unstable_cache` story and creates
  two invalidation sources.
- No new denormalisation (profile stats, flash count). Triggers are
  expensive to maintain; `user_set_stats` already covers leaderboard
  aggregation and the new `get_profile_summary` RPC reads from it.
- No cross-route optimistic UI. Keep optimistic updates where they
  already exist (route log completion); do not extend.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| `unstable_cache` memoises across deployment boundaries unpredictably | Keep TTLs conservative; tag revalidation is authoritative. Document that TTL is a ceiling, not a contract. |
| Tag-based mutations miss an edge case → stale view | Keep TTLs short enough (60s for leaderboard) that stale windows are bounded even if a `revalidateTag` is forgotten. |
| Hand-rolled client cache has a bug | Small surface area (~80 lines). Unit tests cover cache-hit, TTL miss, SWR, coalesce, error. Escape hatch: delete the hook and inline the original Map. |
| Suspense streaming reveals layout shift | Skeletons measured to match final layout; Storybook parity check. |
| Server cache holds stale profile after mutation across regions | Vercel's `revalidateTag` is global. Acceptable. |

---

## Acceptance criteria

Shippable only when:

- [ ] Phase 0: both RPCs in production, typed, tested
- [ ] Phase 1: 11 helpers wrapped; `docs/architecture.md` documents tag taxonomy
- [ ] Phase 2: grep for `revalidatePath.*layout` returns at most one hit
      (onboarding)
- [ ] Phase 3: `/u/[username]` renders shell under 400ms on warm cache;
      streamed children mount within 1s on 4G throttling
- [ ] Phase 4: zero module-level Maps holding fetch results outside
      `useCachedQuery`
- [ ] Phase 5: Lighthouse LCP on `/u/[username]` < 2.5s on 4G
- [ ] `pnpm test --run` green
- [ ] `pnpm next lint` green
- [ ] `pnpm build` green
- [ ] CLAUDE.md "Caching + revalidation" section rewritten to reflect
      the 6-layer model
