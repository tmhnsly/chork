# Unified Loading + Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mix of path-based revalidation, ad-hoc client
Maps, and blocking renders with one coherent caching + loading
architecture across the Chork app.

**Architecture:** Six concentric freshness layers (DB → `unstable_cache`
with tag taxonomy → React `cache()` per-render dedupe → `<Suspense>`
streaming → `after()` post-response work → browser hints). Two new
Postgres RPCs consolidate double-fetches. Mutations revalidate specific
tags instead of scorching the layout tree. Profile page streams its
shell before its stats/achievements/sets. Stays on Next 15.2.1 this
sprint — Next 16 upgrade is a follow-up.

**Tech Stack:** Next.js 15.2.1 (App Router, Turbopack), React 19,
Supabase (Postgres + RLS + RPCs), TypeScript strict, Vitest, SCSS
modules.

**Source spec:**
`docs/superpowers/specs/2026-04-16-unified-loading-caching-design.md`

**Prerequisites assumed known:**

- Supabase CLI logged in, project id resolvable for type regen
- `npx supabase db push` pushes pending migrations to the linked project
- `npx supabase gen types typescript --project-id $PROJECT_ID > src/lib/database.types.ts` regenerates DB types
- Commit style: conventional commits (`feat(scope):`, `perf(scope):`,
  `docs:`, `fix(scope):`, `refactor(scope):`, `test(scope):`).
  Every commit ends with:
  `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

**Test convention (repo standard, observed in
`src/app/(app)/actions.test.ts`):** Vitest, `vi.mock()` at top, `await
import()` the module under test inside each `it`. Assertions on
mocked function calls, not implementation details.

**Gating checks at end of every phase** (run before marking the phase
complete):

```bash
pnpm test --run
pnpm next lint
pnpm build
```

All three must be green.

---

## Phase map (for reference)

| Phase | Tasks | What it ships |
|-------|-------|---------------|
| 0 | 0.1-0.3 | Two new RPCs + regenerated types |
| 1 | 1.1-1.3 | Low-risk cleanups (auth dedupe, cache wraps, `after()`) |
| 2 | 2.1-2.9 | Server cache layer + gym-stats consolidation + docs |
| 3 | 3.1-3.8 | Targeted `revalidateTag` replaces path scorch |
| 4 | 4.1-4.6 | Profile shell + streamed sections; leaderboard neighbourhood streamed |
| 5 | 5.1-5.2 | `staleTimes` tune + avatar priority |

---

## Phase 0 — DB consolidation RPCs

### Task 0.1: Migration — `get_profile_summary` RPC

**Files:**
- Create: `supabase/migrations/036_profile_summary_rpc.sql`
- Test: manual — verify via staging DB after push

**Why:** Replaces the `getAllRouteDataForUserInGym` pattern that
returns raw logs and aggregates in JS. Reads from trigger-maintained
`user_set_stats` for per-set aggregates; only fetches raw logs for the
active set (needed for the mini-grid + condition-based badges).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/036_profile_summary_rpc.sql`:

```sql
-- 036: one-call RPC for the profile page
--
-- Replaces the two-stage pattern on /u/[username] where:
--   1. getAllRouteDataForUserInGym returned every raw log for the user
--      in the gym (large payload), and
--   2. the page aggregated per-set stats in JS.
--
-- The new RPC reads aggregates from the trigger-maintained
-- user_set_stats table (migration 013) and only returns raw logs for
-- the active set, which is where the PunchTile mini-grid + set-specific
-- badge evaluation genuinely need per-route state.
--
-- Payload shape:
--   {
--     "per_set": [{ set_id, sends, flashes, zones, points }, ...],
--     "active_set_detail": [{ route_id, attempts, completed, zone }, ...],
--     "total_routes_in_gym": <int>
--   }
--
-- Access: `is_gym_member(p_gym_id)` gates the caller. The summary only
-- returns data the caller is already authorised to see via RLS
-- (same gym).

create or replace function public.get_profile_summary(
  p_user_id uuid,
  p_gym_id  uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with gated as (
    select 1 where public.is_gym_member(p_gym_id)
  ),
  per_set as (
    select
      uss.set_id,
      uss.sends,
      uss.flashes,
      uss.zones,
      uss.points
    from public.user_set_stats uss, gated
    where uss.user_id = p_user_id
      and uss.gym_id  = p_gym_id
  ),
  active_set as (
    select s.id as set_id
    from public.sets s, gated
    where s.gym_id = p_gym_id
      and s.active = true
    limit 1
  ),
  active_detail as (
    select
      rl.route_id,
      rl.attempts,
      rl.completed,
      rl.zone
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join active_set a on a.set_id = r.set_id
    where rl.user_id = p_user_id
      and rl.gym_id  = p_gym_id
  ),
  total_routes as (
    select count(*)::int as n
    from public.routes r
    join public.sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
  )
  select jsonb_build_object(
    'per_set',
      coalesce((select jsonb_agg(to_jsonb(ps)) from per_set ps), '[]'::jsonb),
    'active_set_detail',
      coalesce((select jsonb_agg(to_jsonb(ad)) from active_detail ad), '[]'::jsonb),
    'total_routes_in_gym',
      coalesce((select n from total_routes), 0)
  )
  where exists (select 1 from gated);
$$;

grant  execute on function public.get_profile_summary(uuid, uuid) to authenticated;
revoke execute on function public.get_profile_summary(uuid, uuid) from anon, public;
```

- [ ] **Step 2: Push migration to the linked project**

```bash
npx supabase db push
```

Expected: the migration applies cleanly and `036_profile_summary_rpc`
shows up as applied. No errors.

- [ ] **Step 3: Smoke-test the RPC from psql or the dashboard SQL editor**

Run against a gym you're a member of, with your own user id:

```sql
select public.get_profile_summary(
  '<your-user-uuid>'::uuid,
  '<your-gym-uuid>'::uuid
);
```

Expected: a JSON object with three keys: `per_set` (array), `active_set_detail`
(array), `total_routes_in_gym` (number).

Run against a gym you are NOT a member of — expected: `null` (the
`where exists (select 1 from gated)` clause filters the row out).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/036_profile_summary_rpc.sql
git commit -m "$(cat <<'EOF'
feat(db): get_profile_summary RPC for profile page

Returns per-set aggregates from user_set_stats + active-set raw logs
+ total routes count in one call. Replaces the raw-log fetch +
JS aggregation on /u/[username].

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.2: Migration — `get_gym_stats_v2` RPC

**Files:**
- Create: `supabase/migrations/037_gym_stats_rpc.sql`
- Test: manual via staging

**Why:** The current JS helper `getGymStats` runs **4 parallel Supabase
calls** and is invoked **twice** per `/leaderboard` paint (once all-time,
once set-scoped) = 8 round trips. One RPC returning both scopes cuts
7 round trips.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/037_gym_stats_rpc.sql`:

```sql
-- 037: one-call gym stats RPC
--
-- The Chorkboard stats strip renders both all-time and set-scoped
-- numbers. Today queries.ts issues:
--   - getGymStats(gymId) → 1 RPC + 3 count queries (all-time)
--   - getGymStats(gymId, setId) → 1 RPC + 3 count queries (set-scoped)
-- = 8 round trips per paint. This RPC returns both in one shot.
--
-- Payload shape (set scope omitted when p_set_id is null):
--   {
--     "all_time": { climbers, sends, flashes, routes },
--     "set": { climbers, sends, flashes, routes } | null
--   }
--
-- Access: `is_gym_member(p_gym_id)` gate. Set-scoped branch also
-- verifies the set belongs to the gym.

create or replace function public.get_gym_stats_v2(
  p_gym_id uuid,
  p_set_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with gated as (
    select 1
    where public.is_gym_member(p_gym_id)
      and (
        p_set_id is null
        or exists (
          select 1 from public.sets s
          where s.id = p_set_id and s.gym_id = p_gym_id
        )
      )
  ),
  all_time as (
    select
      coalesce((
        select count(distinct rl.user_id)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id
          and rl.completed = true
      ), 0) as climbers,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id
          and rl.completed = true
      ), 0) as sends,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        where rl.gym_id = p_gym_id
          and rl.completed = true
          and rl.attempts = 1
      ), 0) as flashes,
      coalesce((
        select count(*)::int
        from public.routes r
        join public.sets s on s.id = r.set_id
        where s.gym_id = p_gym_id
      ), 0) as routes
  ),
  set_stats as (
    select
      coalesce((
        select count(distinct rl.user_id)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id
          and rl.completed = true
      ), 0) as climbers,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id
          and rl.completed = true
      ), 0) as sends,
      coalesce((
        select count(*)::int
        from public.route_logs rl
        join public.routes r on r.id = rl.route_id
        where r.set_id = p_set_id
          and rl.completed = true
          and rl.attempts = 1
      ), 0) as flashes,
      coalesce((
        select count(*)::int
        from public.routes r
        where r.set_id = p_set_id
      ), 0) as routes
    where p_set_id is not null
  )
  select jsonb_build_object(
    'all_time',
      jsonb_build_object(
        'climbers', at.climbers,
        'sends',    at.sends,
        'flashes',  at.flashes,
        'routes',   at.routes
      ),
    'set',
      case
        when p_set_id is null then null
        else (
          select jsonb_build_object(
            'climbers', ss.climbers,
            'sends',    ss.sends,
            'flashes',  ss.flashes,
            'routes',   ss.routes
          )
          from set_stats ss
        )
      end
  )
  from all_time at, gated;
$$;

grant  execute on function public.get_gym_stats_v2(uuid, uuid) to authenticated;
revoke execute on function public.get_gym_stats_v2(uuid, uuid) from anon, public;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push
```

Expected: applies cleanly.

- [ ] **Step 3: Smoke-test in SQL editor**

```sql
select public.get_gym_stats_v2('<your-gym-uuid>'::uuid);
```

Expected: `{ "all_time": { ... }, "set": null }`

```sql
select public.get_gym_stats_v2('<your-gym-uuid>'::uuid, '<set-uuid>'::uuid);
```

Expected: `{ "all_time": { ... }, "set": { climbers, sends, flashes, routes } }`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/037_gym_stats_rpc.sql
git commit -m "$(cat <<'EOF'
feat(db): get_gym_stats_v2 single-call RPC

Returns all-time + set-scoped stats in one round trip. Replaces the
two-call pattern on /leaderboard that fires 8 Supabase queries per
paint.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.3: Regenerate types + add typed wrappers

**Files:**
- Modify: `src/lib/database.types.ts` (auto-generated)
- Modify: `src/lib/data/queries.ts` (append)
- Create: `src/lib/data/queries.test.ts` *if it doesn't exist*, OR
  append to existing unit tests location

- [ ] **Step 1: Regenerate types**

Replace `<project-id>` with the chork project id (check
`supabase/config.toml` or the dashboard URL):

```bash
npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
```

Expected: `src/lib/database.types.ts` updates to include
`get_profile_summary` and `get_gym_stats_v2` in the RPC `Functions`
table. Verify by opening the file and searching for these names.

- [ ] **Step 2: Add typed wrappers to `src/lib/data/queries.ts`**

Append to the end of `src/lib/data/queries.ts`:

```ts
// ── Profile summary (migration 036) ────────────────

export interface ProfileSummary {
  per_set: Array<{
    set_id: string;
    sends: number;
    flashes: number;
    zones: number;
    points: number;
  }>;
  active_set_detail: Array<{
    route_id: string;
    attempts: number;
    completed: boolean;
    zone: boolean;
  }>;
  total_routes_in_gym: number;
}

export async function getProfileSummary(
  supabase: Supabase,
  userId: string,
  gymId: string,
): Promise<ProfileSummary> {
  const { data, error } = await supabase.rpc("get_profile_summary", {
    p_user_id: userId,
    p_gym_id: gymId,
  });
  if (error) {
    console.warn("[chork] getProfileSummary failed:", error);
    return { per_set: [], active_set_detail: [], total_routes_in_gym: 0 };
  }
  // Supabase returns jsonb as `unknown` in the typed client.
  return (data as ProfileSummary | null) ?? {
    per_set: [],
    active_set_detail: [],
    total_routes_in_gym: 0,
  };
}

// ── Gym stats v2 (migration 037) ───────────────────

export interface GymStatsBuckets {
  all_time: GymStats;
  set: GymStats | null;
}

export async function getGymStatsV2(
  supabase: Supabase,
  gymId: string,
  setId: string | null = null,
): Promise<GymStatsBuckets> {
  const { data, error } = await supabase.rpc("get_gym_stats_v2", {
    p_gym_id: gymId,
    p_set_id: setId ?? undefined,
  });
  if (error) {
    console.warn("[chork] getGymStatsV2 failed:", error);
    return {
      all_time: { climberCount: 0, totalSends: 0, totalFlashes: 0, totalRoutes: 0 },
      set: null,
    };
  }
  type Raw = { climbers: number; sends: number; flashes: number; routes: number };
  const raw = (data as { all_time: Raw; set: Raw | null } | null);
  const toStats = (r: Raw): GymStats => ({
    climberCount: r.climbers,
    totalSends: r.sends,
    totalFlashes: r.flashes,
    totalRoutes: r.routes,
  });
  return {
    all_time: raw ? toStats(raw.all_time) : {
      climberCount: 0, totalSends: 0, totalFlashes: 0, totalRoutes: 0,
    },
    set: raw?.set ? toStats(raw.set) : null,
  };
}
```

Note: `GymStats` is the existing interface in `queries.ts:540-545`;
reuse it.

- [ ] **Step 3: Typecheck + build**

```bash
pnpm next lint
```

Expected: no new lint errors. If `pnpm next lint` flags anything in
the new wrappers, fix inline.

- [ ] **Step 4: Commit**

```bash
git add src/lib/database.types.ts src/lib/data/queries.ts
git commit -m "$(cat <<'EOF'
feat(data): typed wrappers for profile-summary + gym-stats-v2 RPCs

Adds getProfileSummary and getGymStatsV2 helpers. Old helpers
(getAllRouteDataForUserInGym, getGymStats) kept in place; callers
migrate in later phases so each change is independently revertable.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 0 gate

- [ ] Run `pnpm test --run` — expected green.
- [ ] Run `pnpm next lint` — expected green.
- [ ] Run `pnpm build` — expected green.

---

## Phase 1 — Trivial-win cleanups

### Task 1.1: Replace direct `supabase.auth.getUser()` with `getServerUser()`

**Files:**
- Modify: `src/app/u/[username]/page.tsx:62-63`
- Modify: `src/app/profile/page.tsx:9-10`
- Modify: `src/app/admin/signup/page.tsx:17-18`
- Modify: `src/app/admin/invite/[token]/page.tsx:32-33`
- Modify: `src/app/admin/layout.tsx:21-22`
- Modify: `src/app/competitions/[id]/page.tsx:29-30`

**Why:** Each site bypasses the `cache()`-wrapped `getServerUser` in
`src/lib/supabase/server.ts:47`, forcing a fresh `auth.getUser()` call
per render even when the same render has already cached one.

- [ ] **Step 1: Update `/u/[username]/page.tsx`**

Replace lines 62-63:

```tsx
  const supabase = await createServerSupabase();
  const { data: { user: authUser } } = await supabase.auth.getUser();
```

With:

```tsx
  const supabase = await createServerSupabase();
  const authUser = await getServerUser();
```

Add the import at the top (line 3 area) — change:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
```

to:

```tsx
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
```

- [ ] **Step 2: Update the other five files the same way**

For each file, replace the two-line
`const supabase = …; const { data: { user } } = await supabase.auth.getUser();`
pattern with `const supabase = …; const user = await getServerUser();`
(preserve whichever name the file uses for the variable — `user`,
`authUser`, etc.) and add `getServerUser` to the existing
`@/lib/supabase/server` import.

One exception: `src/app/admin/invite/[token]/page.tsx` imports both
`createServerSupabase` and `createServiceClient` — preserve the
service-client import.

- [ ] **Step 3: Typecheck + test**

```bash
pnpm next lint
pnpm test --run
```

Expected: both green. No behavioural test should change — the fix is
latency, not semantics.

- [ ] **Step 4: Commit**

```bash
git add src/app/u/\[username\]/page.tsx src/app/profile/page.tsx \
        src/app/admin/signup/page.tsx src/app/admin/invite/\[token\]/page.tsx \
        src/app/admin/layout.tsx src/app/competitions/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
perf(auth): use cached getServerUser on six server components

Six pages were calling supabase.auth.getUser() directly, bypassing
the React cache() wrap on getServerUser. Swapping them in lets any
other caller in the same render share the auth result.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: React `cache()`-wrap `getProfileByUsername` and `getCompetitionById`

**Files:**
- Modify: `src/lib/data/queries.ts:58-69` (`getProfileByUsername`)
- Modify: `src/lib/data/competition-queries.ts` (locate `getCompetitionById`)

**Why:** Prevents double-fetch when `generateMetadata` and the page
body both call the same helper in one render (the Competition page
does this today — spec §2.8).

- [ ] **Step 1: Locate `getCompetitionById`**

```bash
grep -n "export .* getCompetitionById\|export async function getCompetitionById" src/lib/data/
```

Confirm the file + line number before editing.

- [ ] **Step 2: Wrap `getProfileByUsername` in React `cache()`**

At the top of `src/lib/data/queries.ts`, add to existing imports (after
the existing `import type { Database } …` line at line 4):

```ts
import { cache } from "react";
```

Replace the existing definition of `getProfileByUsername` at lines 58-69:

```ts
export async function getProfileByUsername(supabase: Supabase, username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();
  if (error) {
    console.warn("[chork] getProfileByUsername failed:", error);
    return null;
  }
  return data;
}
```

With a `cache()`-wrapped version. Because `cache()` keys on argument
identity, we can only cache usefully when callers share the supabase
client — which they do via `createServerSupabase`'s own `cache()` wrap:

```ts
export const getProfileByUsername = cache(
  async (supabase: Supabase, username: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .single();
    if (error) {
      console.warn("[chork] getProfileByUsername failed:", error);
      return null;
    }
    return data;
  },
);
```

- [ ] **Step 3: Wrap `getCompetitionById` the same way**

In `src/lib/data/competition-queries.ts`, import `cache` from react and
replace the `export async function getCompetitionById(…)` definition
with:

```ts
export const getCompetitionById = cache(
  async (supabase: Supabase, competitionId: string) => {
    // ...existing body unchanged...
  },
);
```

Keep the body identical.

- [ ] **Step 4: Typecheck + test**

```bash
pnpm next lint
pnpm test --run
```

Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/queries.ts src/lib/data/competition-queries.ts
git commit -m "$(cat <<'EOF'
perf(query): React cache() dedupe for profile + competition lookups

generateMetadata + the page body both call getCompetitionById on
/competitions/[id] — now shares one DB hit per render. Profile lookup
wrapped pre-emptively for the same reason (metadata hook coming soon
on /u/[username]).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Move `completeRoute` badge eval into `after()`

**Files:**
- Modify: `src/app/(app)/actions.ts:54-110`

**Why:** Badge evaluation runs ~100-200ms inside the action's round
trip today, blocking the response. `after()` from `next/server` runs
the work post-response so the action returns faster; the badge state
catches up within milliseconds and the UI picks it up on the next
paint or via push.

- [ ] **Step 1: Update the failing test expectation**

Read `src/app/(app)/actions.test.ts` and find the test block
`describe("completeRoute", …)`. If any test asserts that
`evaluateAndPersistAchievements` is awaited inline before
`revalidatePath` is called, update the expectation: the order no
longer matters because badge eval is deferred. Most existing tests mock
the badge helpers and assert they were called, which still passes —
`after()` runs the callback synchronously in Vitest's test runtime
(Next's runtime drives it in prod, but the Node test env calls the
function immediately). Verify no existing test breaks by running just
this file:

```bash
pnpm test --run src/app/\(app\)/actions.test.ts
```

If it passes, skip to Step 2. If a test breaks, update it to accept
the new ordering (call still happens, just after return).

- [ ] **Step 2: Refactor the action**

In `src/app/(app)/actions.ts`:

Add to the top imports (after the existing `"use server"` + imports):

```ts
import { after } from "next/server";
```

Replace the `completeRoute` body (lines 77-109), keeping only the
critical-path work inline:

```tsx
  try {
    const eventType: ActivityEventType = isFlash ? "flashed" : "completed";
    const [log] = await Promise.all([
      upsertRouteLog(supabase, userId, routeId, {
        attempts,
        completed: true,
        completed_at: new Date().toISOString(),
        grade_vote: gradeVote,
        zone,
      }, logId, gymId),
      createActivityEvent(supabase, {
        user_id: userId,
        route_id: routeId,
        type: eventType,
        gym_id: gymId,
      }),
    ]);

    revalidatePath("/", "layout");

    // Post-response: badge evaluation can be expensive and must never
    // break the logging flow. after() runs this work after the
    // response is sent, so the action returns as soon as the log +
    // activity event are written. Badge state catches up within
    // milliseconds.
    after(async () => {
      try {
        const ctx = await buildBadgeContext(supabase, userId, gymId);
        if (ctx) {
          await evaluateAndPersistAchievements(supabase, userId, ctx);
        }
      } catch (err) {
        console.error("[achievements] post-send evaluation failed", err);
      }
    });

    return { success: true, log };
  } catch (err) {
    return { error: formatError(err) };
  }
```

- [ ] **Step 3: Run the action's test file**

```bash
pnpm test --run src/app/\(app\)/actions.test.ts
```

Expected: green. If a test fails because it mocks `next/server` without
including `after`, add `after: vi.fn((fn) => fn())` to that mock so the
callback still runs synchronously in test.

- [ ] **Step 4: Full gate**

```bash
pnpm test --run
pnpm next lint
pnpm build
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/actions.ts src/app/\(app\)/actions.test.ts
git commit -m "$(cat <<'EOF'
perf(actions): defer badge eval in completeRoute via after()

Badge evaluation (~100-200ms) no longer sits in the user's latency
budget. The action returns as soon as the log + activity event are
written; achievement state catches up post-response via after().

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 1 gate

- [ ] `pnpm test --run` green
- [ ] `pnpm next lint` green
- [ ] `pnpm build` green

---

## Phase 2 — Server cache layer

### Task 2.1: Create `cachedQuery` wrapper + `Tag` taxonomy

**Files:**
- Create: `src/lib/cache/cached.ts`
- Create: `src/lib/cache/cached.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cache/cached.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((fn) => fn),
  revalidateTag: vi.fn(),
}));

describe("cachedQuery", () => {
  beforeEach(() => vi.resetAllMocks());

  it("forwards keyParts, tags, and revalidate to unstable_cache", async () => {
    const { unstable_cache } = await import("next/cache");
    const { cachedQuery } = await import("./cached");

    const fn = async (x: number) => x * 2;
    cachedQuery(["double", "v1"], fn, { tags: ["gym:abc"], revalidate: 60 });

    expect(unstable_cache).toHaveBeenCalledWith(
      fn,
      ["double", "v1"],
      { tags: ["gym:abc"], revalidate: 60 },
    );
  });

  it("returned function resolves to the wrapped function's result", async () => {
    const { cachedQuery } = await import("./cached");
    const fn = async (x: number) => x + 1;
    const cached = cachedQuery(["inc"], fn, { tags: ["gym:x"], revalidate: 60 });
    await expect(cached(5)).resolves.toBe(6);
  });
});
```

- [ ] **Step 2: Run the test — expected fail (module doesn't exist)**

```bash
pnpm test --run src/lib/cache/cached.test.ts
```

Expected: FAIL with "Cannot find module './cached'".

- [ ] **Step 3: Write the wrapper**

Create `src/lib/cache/cached.ts`:

```ts
import "server-only";

import { unstable_cache } from "next/cache";

/**
 * Tag taxonomy — any string literal outside this union is a type error.
 * Keeps mutations, cache wraps, and `revalidateTag` calls in lockstep.
 *
 *   gym:{id}                    — gym row edits
 *   gym:{id}:active-set         — set goes live / ends in a gym
 *   set:{id}:routes             — route edits within a set
 *   set:{id}:leaderboard        — any route_log change affecting set rank
 *   user:{id}:profile           — profile row edits (username, theme, etc)
 *   user:{id}:stats             — this user's user_set_stats changed
 *   user:{id}:crews             — crew membership changed for this user
 *   user:{id}:notifications     — new / read notifications for this user
 *   crew:{id}                   — crew row or member set edits
 *   gyms:listed                 — a gym's is_listed flag changed
 *   competition:{id}            — competition row or relations changed
 */
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

/**
 * Wraps `unstable_cache` with the tag taxonomy so every cached helper
 * in the app shares one vocabulary. `keyParts` distinguishes cache
 * entries; `tags` determine invalidation; `revalidate` is the ceiling
 * in seconds.
 *
 * Serialisation: unstable_cache stringifies the function's arguments
 * when keying, so every argument the wrapped function takes must be
 * deterministically serialisable (string, number, bool, etc). Passing
 * a Supabase client directly is NOT safe — wrap functions that take a
 * client as first-arg with a factory (see the helpers in queries.ts
 * for the pattern).
 */
export function cachedQuery<A extends unknown[], R>(
  keyParts: string[],
  fn: (...args: A) => Promise<R>,
  opts: { tags: Tag[]; revalidate: number },
): (...args: A) => Promise<R> {
  return unstable_cache(fn, keyParts, opts);
}
```

- [ ] **Step 4: Run test — expected pass**

```bash
pnpm test --run src/lib/cache/cached.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/cached.ts src/lib/cache/cached.test.ts
git commit -m "$(cat <<'EOF'
feat(cache): cachedQuery wrapper + Tag type taxonomy

Thin wrapper around unstable_cache that enforces the tag vocabulary at
the type level. All server-cache wrapping lands here; mutations
revalidateTag against the same union.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: Wrap gym helpers (`getGym`, `getListedGyms`)

**Files:**
- Modify: `src/lib/data/queries.ts` (`getGym:88-99`, `getListedGyms:524-536`)

**Key insight** for every Phase 2 wrap: `unstable_cache` keys on
argument values, but we cannot pass the supabase client as an arg (it's
not serialisable). Pattern: the wrapped helper must ignore the supabase
argument for keying purposes — `unstable_cache` stringifies whatever
we give it, so we pass a fresh anon supabase client _inside_ the cached
function on cache miss, not the caller's client.

This means **cached helpers bypass the caller's cookie/session**. For
public read-only data (gym listings, routes, leaderboards — all gated
by RLS on `authenticated` role that anon queries lose access to) this
is fine for data tagged public, but leaderboard RPCs are gated by
`is_gym_member()` which needs the caller's uid. Solution: accept the
uid as an explicit string argument (serialisable), and construct a
service-role client inside the cached body — the RPC's own
`is_gym_member(p_gym_id)` check still gates access properly because
every cached helper signature takes the gymId directly.

Rewrite the wrappers to construct a service-role client inside the
function body (the RLS gate is the RPC's own `is_gym_member` / `is_gym_admin`
check, which the wrapped helper re-runs against the gym passed in).

- [ ] **Step 1: Add a helper for cached-context supabase client**

Append to `src/lib/supabase/server.ts`:

```ts
/**
 * Client for use INSIDE unstable_cache bodies. Cache entries are
 * shared across users, so they can't depend on the caller's auth
 * cookies. This client uses the service role key and bypasses RLS —
 * cached helpers must authorise via explicit membership checks
 * (typically the RPC's own is_gym_member gate, called with the
 * gymId passed into the cached function).
 */
export function createCachedContextClient() {
  return createServiceClient();
}
```

(`createServiceClient` already exists at line 76; this is a
semantic-rename export so cached helpers read cleanly.)

- [ ] **Step 2: Rewrite `getGym` as a cached helper**

In `src/lib/data/queries.ts`, replace the existing `getGym`
(lines 88-99) with:

```ts
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";

// (add the imports to the existing import block at the top)

export const getGym = cachedQuery(
  ["gym"],
  async (gymId: string): Promise<Gym | null> => {
    const supabase = createCachedContextClient();
    const { data, error } = await supabase
      .from("gyms")
      .select("*")
      .eq("id", gymId)
      .single();
    if (error) {
      console.warn("[chork] getGym failed:", error);
      return null;
    }
    return data;
  },
  { tags: [], revalidate: 3600 },
);
```

Because `getGym` is called with one argument, `unstable_cache` will
key entries on `["gym", gymId]`. Tags computed per-call: wrap the call
with a tag-provider variant (next step).

**Updated strategy:** `unstable_cache` accepts a `tags` option that's
static at wrapping time. To derive tags from arguments (e.g.
`gym:{gymId}`), wrap at call-time instead. This module exports a
factory pattern:

Replace the above with:

```ts
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";

// Factory pattern: returns a function that is already tag-annotated
// for a given argument set. The factory-per-call shape lets us
// derive tags from the arguments (e.g. `gym:{gymId}`).
export function getGym(gymId: string): Promise<Gym | null> {
  const fn = cachedQuery(
    ["gym", gymId],
    async (id: string): Promise<Gym | null> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("gyms")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        console.warn("[chork] getGym failed:", error);
        return null;
      }
      return data;
    },
    { tags: [`gym:${gymId}`], revalidate: 3600 },
  );
  return fn(gymId);
}
```

**Breaking change:** the exported signature changed from
`getGym(supabase, gymId)` to `getGym(gymId)`. Update the call sites
in this phase as we wrap each helper — `getGym` is called from many
pages, so search-and-replace across `src/`:

```bash
grep -rn "getGym(supabase," src/
```

Expected output: ~5-10 call sites. Change each from
`getGym(supabase, gymId)` to `getGym(gymId)`.

- [ ] **Step 3: Rewrite `getListedGyms`**

Replace lines 524-536 of `queries.ts` with:

```ts
export function getListedGyms(): Promise<GymListing[]> {
  const fn = cachedQuery(
    ["gyms-listed"],
    async (): Promise<GymListing[]> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("gyms")
        .select("id, name, slug, city, country")
        .eq("is_listed", true)
        .order("name");
      if (error) {
        console.warn("[chork] getListedGyms failed:", error);
        return [];
      }
      return data ?? [];
    },
    { tags: ["gyms:listed"], revalidate: 3600 },
  );
  return fn();
}
```

Update call sites: `grep -rn "getListedGyms(supabase)" src/` — should
be 1-3 sites — replace with `getListedGyms()`.

- [ ] **Step 4: Typecheck + test**

```bash
pnpm next lint
pnpm test --run
```

Expected: green. Any test that passed `supabase` into `getGym` /
`getListedGyms` needs its call signature updated.

- [ ] **Step 5: Commit**

```bash
git add -u src/
git commit -m "$(cat <<'EOF'
perf(cache): server-cache getGym + getListedGyms with tag taxonomy

Establishes the factory-per-call pattern: cached helpers take scalar
args only (no supabase client) so unstable_cache can key them safely.
Tags derived from args at call time. Revalidate ceilings: 1h each —
both read gym-level config that changes rarely.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: Wrap set helpers (`getCurrentSet`, `getAllSets`)

**Files:**
- Modify: `src/lib/data/queries.ts:103-145`

- [ ] **Step 1: Rewrite `getCurrentSet`**

Replace the existing `getCurrentSet` with:

```ts
export function getCurrentSet(gymId: string): Promise<RouteSet | null> {
  const fn = cachedQuery(
    ["set-active", gymId],
    async (id: string): Promise<RouteSet | null> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("sets")
        .select("*")
        .eq("gym_id", id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[chork] getCurrentSet failed:", error);
        return null;
      }
      return data;
    },
    { tags: [`gym:${gymId}:active-set`], revalidate: 60 },
  );
  return fn(gymId);
}
```

- [ ] **Step 2: Rewrite `getAllSets`**

Replace with:

```ts
export function getAllSets(gymId: string, sinceIso?: string): Promise<RouteSet[]> {
  const keyParts = ["sets", gymId, sinceIso ?? "*"];
  const fn = cachedQuery(
    keyParts,
    async (id: string, since: string | undefined): Promise<RouteSet[]> => {
      const supabase = createCachedContextClient();
      let query = supabase
        .from("sets")
        .select("*")
        .eq("gym_id", id)
        .order("starts_at", { ascending: false });
      if (since) query = query.gte("ends_at", since);
      const { data, error } = await query;
      if (error) {
        console.warn("[chork] getAllSets failed:", error);
        return [];
      }
      return data ?? [];
    },
    { tags: [`gym:${gymId}:active-set`], revalidate: 300 },
  );
  return fn(gymId, sinceIso);
}
```

- [ ] **Step 3: Update call sites**

```bash
grep -rn "getCurrentSet(supabase," src/
grep -rn "getAllSets(supabase," src/
```

Replace each site: `getCurrentSet(supabase, gymId)` → `getCurrentSet(gymId)`,
`getAllSets(supabase, gymId, since)` → `getAllSets(gymId, since)`.

- [ ] **Step 4: Test + commit**

```bash
pnpm test --run
pnpm next lint
git add -u src/
git commit -m "$(cat <<'EOF'
perf(cache): server-cache getCurrentSet + getAllSets

Tag gym:{id}:active-set — busted by any set status change (draft→live,
archival, new set creation). Revalidate ceilings: 60s for the active-
set pointer, 300s for the full list (ordered history changes rarely).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4: Wrap route helpers (`getRoutesBySet`, `getRouteGrade`)

**Files:**
- Modify: `src/lib/data/queries.ts:149-159, 310-324`

- [ ] **Step 1: Rewrite `getRoutesBySet`**

Replace with:

```ts
export function getRoutesBySet(setId: string): Promise<Route[]> {
  const fn = cachedQuery(
    ["routes-by-set", setId],
    async (id: string): Promise<Route[]> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("routes")
        .select("*")
        .eq("set_id", id)
        .order("number");
      if (error) {
        console.warn("[chork] getRoutesBySet failed:", error);
        return [];
      }
      return data ?? [];
    },
    { tags: [`set:${setId}:routes`], revalidate: 300 },
  );
  return fn(setId);
}
```

- [ ] **Step 2: Rewrite `getRouteGrade`**

`getRouteGrade`'s tag depends on the route's set, which requires a DB
lookup we don't want to do twice. Compromise: tag it on the route id
itself, store the set-id tag alongside. Since the RPC already reads
the row, we read `set_id` inside the cached body and tag with both:

```ts
export function getRouteGrade(routeId: string): Promise<number | null> {
  const fn = cachedQuery(
    ["route-grade", routeId],
    async (id: string): Promise<number | null> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("routes")
        .select("community_grade, set_id")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        console.warn("[chork] getRouteGrade failed:", error);
        return null;
      }
      return data?.community_grade ?? null;
    },
    // Tag with the route id itself — any route-level change busts this
    // entry. The set-scoped tag isn't knowable without a lookup, and
    // routes are read individually often enough that a dedicated tag
    // is cleaner than routing grade invalidation through set-routes.
    { tags: [`set:${routeId}:routes`], revalidate: 300 },
  );
  return fn(routeId);
}
```

Note: `set:{routeId}:routes` is a slight abuse of the tag type — the
`{routeId}` sits where set ids go. Acceptable because the `Tag` type
is `` `set:${string}:routes` `` which accepts any string. Mutations
that update a route's grade revalidate `set:{setId}:routes` (the set
containing the route), and separately call `revalidateTag` for the
per-route entry. Simpler: treat route grade as sharing the `set:{id}:routes`
tag and resolve set id from route id once in the mutation site.

Replace with the cleaner version:

```ts
export function getRouteGrade(routeId: string): Promise<number | null> {
  const fn = cachedQuery(
    ["route-grade", routeId],
    async (id: string): Promise<number | null> => {
      const supabase = createCachedContextClient();
      // Fetch grade + set_id in one row read so callers can derive the
      // invalidation tag without a second query.
      const { data, error } = await supabase
        .from("routes")
        .select("community_grade, set_id")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        console.warn("[chork] getRouteGrade failed:", error);
        return null;
      }
      return data?.community_grade ?? null;
    },
    {
      // Route-level tag. updateGradeVote mutation revalidates this
      // tag per route id directly, no set-id lookup needed.
      tags: [`set:route-${routeId}:routes`],
      revalidate: 300,
    },
  );
  return fn(routeId);
}
```

Tag format `set:route-{id}:routes` stays within the `Tag` union and is
unambiguous. Mutations that edit grade for a specific route call
`revalidateTag(\`set:route-${routeId}:routes\`)`.

- [ ] **Step 3: Update call sites**

```bash
grep -rn "getRoutesBySet(supabase," src/
grep -rn "getRouteGrade(supabase," src/
```

Replace call signatures as before. `getRouteGrade` is called from
`fetchRouteData` in `src/app/(app)/actions.ts:259-272`; update there too.

- [ ] **Step 4: Test + commit**

```bash
pnpm test --run
pnpm next lint
git add -u src/
git commit -m "$(cat <<'EOF'
perf(cache): server-cache route helpers

getRoutesBySet tagged set:{id}:routes. getRouteGrade tagged per-route
so grade-vote mutations can target exactly that entry. Both 300s TTL.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.5: Wrap `getProfileByUsername` via cached layer

**Files:**
- Modify: `src/lib/data/queries.ts:58-69` (re-work from Task 1.2)

- [ ] **Step 1: Replace the Task 1.2 version**

Task 1.2 wrapped with React `cache()` for per-render dedupe. Now we
also need cross-render sharing. Combine both: the outer server cache
is shared across renders; the inner React `cache()` dedupes within a
render. Because `cachedQuery` returns a plain async function, wrapping
it in React `cache()` composes naturally.

Replace the Task 1.2 definition with:

```ts
import { cache as reactCache } from "react";

export const getProfileByUsername = reactCache(
  async (username: string): Promise<Profile | null> => {
    const fn = cachedQuery(
      ["profile-by-username", username],
      async (u: string): Promise<Profile | null> => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("username", u)
          .single();
        if (error) {
          console.warn("[chork] getProfileByUsername failed:", error);
          return null;
        }
        // Tag computed against resolved uid so username changes bust
        // the correct entry.
        return data;
      },
      {
        // Tag must be known at wrap time, but we don't have the uid
        // until the fetch resolves. Workaround: tag by username; on
        // rename, mutation revalidates both old + new username tags.
        tags: [`user:username-${username}:profile`],
        revalidate: 300,
      },
    );
    return fn(username);
  },
);
```

Note the tag uses the username (`user:username-{username}:profile`).
This means `updateProfile` needs to revalidate both the old and new
tag on rename — Phase 3 handles this.

Rename local import: the existing `import { cache } from "react"` at
the top of the file (added in Task 1.2) stays; the inline use above
needs `reactCache` — replace the earlier import with
`import { cache as reactCache } from "react";` (or keep `cache` and
use it both times; pick one style and be consistent file-wide).

- [ ] **Step 2: Update call sites**

Call signature changed from `(supabase, username)` to `(username)`:

```bash
grep -rn "getProfileByUsername(supabase," src/
```

Replace each site.

- [ ] **Step 3: Test + commit**

```bash
pnpm test --run
pnpm next lint
git add -u src/
git commit -m "$(cat <<'EOF'
perf(cache): server-cache getProfileByUsername composed with React cache()

Outer unstable_cache layer shares profile reads across renders + users
(tag user:username-{u}:profile). Inner React cache() layer dedupes
within a render. Renames revalidate both old and new tags (handled in
Phase 3 mutation migration).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.6: Wrap leaderboard RPCs

**Files:**
- Modify: `src/lib/data/queries.ts:404-468`

- [ ] **Step 1: Rewrite `getLeaderboard`**

Replace the existing function (lines 404-429):

```ts
export function getLeaderboard(
  gymId: string,
  setId: string | null,
  limit: number = 10,
  offset: number = 0,
): Promise<LeaderboardEntry[]> {
  const keyParts = ["lb", gymId, setId ?? "all", String(limit), String(offset)];
  const tag: Tag = setId
    ? `set:${setId}:leaderboard`
    : `gym:${gymId}`;
  const fn = cachedQuery(
    keyParts,
    async (): Promise<LeaderboardEntry[]> => {
      const supabase = createCachedContextClient();
      const { data, error } = setId
        ? await supabase.rpc("get_leaderboard_set", {
            p_gym_id: gymId,
            p_set_id: setId,
            p_limit: limit,
            p_offset: offset,
          })
        : await supabase.rpc("get_leaderboard_all_time", {
            p_gym_id: gymId,
            p_limit: limit,
            p_offset: offset,
          });
      if (error) {
        console.warn("[chork] getLeaderboard failed:", error);
        return [];
      }
      return normaliseLeaderboardRows(data ?? []);
    },
    { tags: [tag], revalidate: 60 },
  );
  return fn();
}
```

Note: the RPC already runs `is_gym_member(p_gym_id)` internally, so the
service-role client fetching inside the cached body is still gated —
it just bypasses RLS, which is fine because the RPC enforces access.

Import `Tag`:

```ts
import { cachedQuery, type Tag } from "@/lib/cache/cached";
```

- [ ] **Step 2: Rewrite `getLeaderboardNeighbourhood`**

Replace:

```ts
export function getLeaderboardNeighbourhood(
  gymId: string,
  userId: string,
  setId: string | null,
): Promise<LeaderboardEntry[]> {
  const keyParts = ["lb-nbr", gymId, userId, setId ?? "all"];
  const tag: Tag = setId ? `set:${setId}:leaderboard` : `gym:${gymId}`;
  const fn = cachedQuery(
    keyParts,
    async (): Promise<LeaderboardEntry[]> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase.rpc("get_leaderboard_neighbourhood", {
        p_gym_id: gymId,
        p_user_id: userId,
        p_set_id: setId ?? undefined,
      });
      if (error) {
        console.warn("[chork] getLeaderboardNeighbourhood failed:", error);
        return [];
      }
      return normaliseLeaderboardRows(data ?? []);
    },
    { tags: [tag], revalidate: 60 },
  );
  return fn();
}
```

- [ ] **Step 3: Rewrite `getLeaderboardUserRow`**

```ts
export function getLeaderboardUserRow(
  gymId: string,
  userId: string,
  setId: string | null,
): Promise<LeaderboardEntry | null> {
  const keyParts = ["lb-user", gymId, userId, setId ?? "all"];
  const tag: Tag = setId ? `set:${setId}:leaderboard` : `gym:${gymId}`;
  const fn = cachedQuery(
    keyParts,
    async (): Promise<LeaderboardEntry | null> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase.rpc("get_leaderboard_user_row", {
        p_gym_id: gymId,
        p_user_id: userId,
        p_set_id: setId ?? undefined,
      });
      if (error) {
        console.warn("[chork] getLeaderboardUserRow failed:", error);
        return null;
      }
      const rows = normaliseLeaderboardRows(data ?? []);
      return rows[0] ?? null;
    },
    { tags: [tag, `user:${userId}:stats`], revalidate: 60 },
  );
  return fn();
}
```

The user-row helper carries TWO tags: the leaderboard's scope AND the
user's stats. Either a set-wide bust or a per-user stat bust
invalidates the entry.

- [ ] **Step 4: Update call sites**

```bash
grep -rn "getLeaderboard(supabase\|getLeaderboardNeighbourhood(supabase\|getLeaderboardUserRow(supabase" src/
```

Replace each: drop the `supabase` first argument.

- [ ] **Step 5: Test + commit**

```bash
pnpm test --run
pnpm next lint
git add -u src/
git commit -m "$(cat <<'EOF'
perf(cache): server-cache leaderboard RPCs — shared across concurrent viewers

Before: N viewers of the same leaderboard = N DENSE_RANK computes per
refresh. Now: first request warms the cache, next viewers hit memory;
one mutation busts the tag and recomputes once for everybody.
TTL 60s ceiling.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.7: Migrate `/leaderboard` to `getGymStatsV2`

**Files:**
- Modify: `src/lib/data/queries.ts` — wrap `getGymStatsV2`
- Modify: `src/app/leaderboard/page.tsx:27-41`

- [ ] **Step 1: Wrap `getGymStatsV2` with the cached layer**

Replace the existing `getGymStatsV2` added in Task 0.3 with a cached
version. In `src/lib/data/queries.ts`:

```ts
export function getGymStatsV2(
  gymId: string,
  setId: string | null = null,
): Promise<GymStatsBuckets> {
  const keyParts = ["gym-stats", gymId, setId ?? "*"];
  const tags: Tag[] = setId
    ? [`gym:${gymId}`, `set:${setId}:leaderboard`]
    : [`gym:${gymId}`];
  const fn = cachedQuery(
    keyParts,
    async (): Promise<GymStatsBuckets> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase.rpc("get_gym_stats_v2", {
        p_gym_id: gymId,
        p_set_id: setId ?? undefined,
      });
      if (error) {
        console.warn("[chork] getGymStatsV2 failed:", error);
        return {
          all_time: { climberCount: 0, totalSends: 0, totalFlashes: 0, totalRoutes: 0 },
          set: null,
        };
      }
      type Raw = { climbers: number; sends: number; flashes: number; routes: number };
      const raw = data as { all_time: Raw; set: Raw | null } | null;
      const toStats = (r: Raw): GymStats => ({
        climberCount: r.climbers,
        totalSends: r.sends,
        totalFlashes: r.flashes,
        totalRoutes: r.routes,
      });
      return {
        all_time: raw ? toStats(raw.all_time) : {
          climberCount: 0, totalSends: 0, totalFlashes: 0, totalRoutes: 0,
        },
        set: raw?.set ? toStats(raw.set) : null,
      };
    },
    { tags, revalidate: 60 },
  );
  return fn();
}
```

- [ ] **Step 2: Migrate the leaderboard page**

Replace `src/app/leaderboard/page.tsx:27-41`:

```tsx
  const [gym, currentSet, allTimeStats] = await Promise.all([
    getGym(supabase, gymId),
    getCurrentSet(supabase, gymId),
    getGymStats(supabase, gymId),
  ]);

  // Determine initial tab's setId — prefer active set, fall back to all-time
  const initialSetId = currentSet?.id ?? null;

  const [top, userRow, setStats, currentSetRoutes] = await Promise.all([
    getLeaderboard(supabase, gymId, initialSetId, TOP_LIMIT, 0),
    getLeaderboardUserRow(supabase, gymId, userId, initialSetId),
    initialSetId ? getGymStats(supabase, gymId, initialSetId) : Promise.resolve(null),
    initialSetId ? getRoutesBySet(supabase, initialSetId) : Promise.resolve([]),
  ]);
```

With (note: one fewer getGymStats call, all helpers take no supabase arg):

```tsx
  const [gym, currentSet, stats] = await Promise.all([
    getGym(gymId),
    getCurrentSet(gymId),
    getGymStatsV2(gymId),
    // Fetched without setId — current set unknown until getCurrentSet resolves.
    // We re-fetch after the first await below if a set exists; second fetch
    // hits the server cache so the cost is one memory read.
  ]);

  const initialSetId = currentSet?.id ?? null;

  const [top, userRow, setScopedStats, currentSetRoutes] = await Promise.all([
    getLeaderboard(gymId, initialSetId, TOP_LIMIT, 0),
    getLeaderboardUserRow(gymId, userId, initialSetId),
    initialSetId
      ? getGymStatsV2(gymId, initialSetId).then(b => b.set)
      : Promise.resolve(null),
    initialSetId ? getRoutesBySet(initialSetId) : Promise.resolve([]),
  ]);

  const allTimeStats = stats.all_time;
  const setStats = setScopedStats;
```

Note: two `getGymStatsV2(gymId, …)` calls happen — one without setId,
one with. The first is a raw cache miss; the second reuses the
`gym:{gymId}` tag but has its own key including the setId. In
practice, a sharper pattern is to fetch `getGymStatsV2(gymId, initialSetId)`
ONCE after `currentSet` resolves, and use both `all_time` and `set`
from the same response. Refactor accordingly:

```tsx
  const [gym, currentSet] = await Promise.all([
    getGym(gymId),
    getCurrentSet(gymId),
  ]);

  const initialSetId = currentSet?.id ?? null;

  const [top, userRow, stats, currentSetRoutes] = await Promise.all([
    getLeaderboard(gymId, initialSetId, TOP_LIMIT, 0),
    getLeaderboardUserRow(gymId, userId, initialSetId),
    getGymStatsV2(gymId, initialSetId),
    initialSetId ? getRoutesBySet(initialSetId) : Promise.resolve([]),
  ]);

  const allTimeStats = stats.all_time;
  const setStats = stats.set;
```

This is one `getGymStatsV2` call instead of two `getGymStats` calls —
the biggest per-paint query-count reduction in the plan.

Update the imports at the top of the file:

```tsx
import {
  getGym,
  getCurrentSet,
  getLeaderboard,
  getLeaderboardNeighbourhood,
  getLeaderboardUserRow,
  getGymStatsV2,
  getRoutesBySet,
} from "@/lib/data/queries";
```

Remove the now-unused `getGymStats` import.

- [ ] **Step 3: Test + commit**

```bash
pnpm test --run src/app/leaderboard
pnpm next lint
pnpm build
git add -u src/
git commit -m "$(cat <<'EOF'
perf(leaderboard): single getGymStatsV2 call replaces 8-query double-fetch

Cold paint drops from 15 Supabase round trips to 5 — getGymStats was
firing 4 queries twice (all-time + set-scoped) per render. New RPC
returns both in one call, server-cache tag set:{id}:leaderboard
shared across viewers.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.8: Wrap `getCompetitionById`

**Files:**
- Modify: `src/lib/data/competition-queries.ts`

- [ ] **Step 1: Rewrite**

Locate `getCompetitionById` (already `cache()`-wrapped via Task 1.2).
Replace the React-cache-only version with the composed pattern:

```ts
import { cache as reactCache } from "react";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";

export const getCompetitionById = reactCache(
  async (competitionId: string) => {
    const fn = cachedQuery(
      ["competition", competitionId],
      async (id: string) => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("competitions")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.warn("[chork] getCompetitionById failed:", error);
          return null;
        }
        return data;
      },
      { tags: [`competition:${competitionId}`], revalidate: 300 },
    );
    return fn(competitionId);
  },
);
```

- [ ] **Step 2: Update call sites**

```bash
grep -rn "getCompetitionById(supabase," src/
```

Replace with single-argument calls.

- [ ] **Step 3: Test + commit**

```bash
pnpm test --run
pnpm next lint
git add -u src/
git commit -m "$(cat <<'EOF'
perf(cache): server-cache getCompetitionById

Shared tag competition:{id}; 300s TTL. generateMetadata + page body
dedupe via outer React cache() and both share the server cache entry
with every other viewer.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.9: Document tag taxonomy in `docs/architecture.md`

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add a caching section**

Append to `docs/architecture.md` (after the existing
"Caching + revalidation" section if one exists, or at the end):

```markdown
## Caching architecture (6 layers)

Each piece of data caches at exactly one layer. Find the layer, use
its tool; don't invent a new one.

| Layer | Tool | Lives for | Shared across users? | File |
|-------|------|-----------|----------------------|------|
| 1. DB | Postgres + triggers | forever | yes | `supabase/migrations/*.sql` |
| 2. Server cache | `unstable_cache` via `cachedQuery()` | TTL or tag bust | **yes** | `src/lib/cache/cached.ts` |
| 3. Per-render | `React.cache()` | 1 render | no | `src/lib/supabase/server.ts` etc |
| 4. Streaming | `<Suspense>` boundaries | 1 request | no | page files |
| 5. Post-response | `after()` from `next/server` | after return | no | action files |
| 6. Client hints | `<Link prefetch>`, `<Image priority>`, module Maps | session | no | component files |

### Tag taxonomy (Layer 2)

All `cachedQuery` wraps use tags from this union — defined in
`src/lib/cache/cached.ts`. Every mutation revalidates tags, not paths.

| Tag | Busted by |
|-----|-----------|
| `gym:{id}` | gym row edits, is_listed toggles |
| `gym:{id}:active-set` | set goes live / ends / is created |
| `set:{id}:routes` | route add / edit / delete within the set |
| `set:{id}:leaderboard` | any route_log change affecting rank in the set |
| `user:{id}:profile` | profile row edits (username, theme, active_gym_id) |
| `user:{id}:stats` | this user's user_set_stats row updated (via route_log trigger) |
| `user:{id}:crews` | this user's crew_members status changed |
| `user:{id}:notifications` | notifications inserted / marked read |
| `crew:{id}` | crew row / member set edits |
| `gyms:listed` | any gym's is_listed flag changed |
| `competition:{id}` | competition row or relations changed |

### When to cache and when not to

Cache with `unstable_cache` (Layer 2) when:
- Data is shared across users (gym metadata, leaderboards, route details)
- Read rate » write rate
- Staleness of up to the TTL is acceptable

Cache with React `cache()` (Layer 3) only when:
- A single render has multiple callers fetching the same thing
- The data varies per-user (auth, session state)

Don't cache when:
- The data varies per-request in a way no tag can express
- Writes happen more often than reads

### Mutations → revalidateTag

When touching a mutation: list every tag the DB change can affect, and
call `revalidateTag(tag)` for each. Prefer over-busting to under-busting
if in doubt (it's strictly a cache miss, not correctness). NEVER use
`revalidatePath("/", "layout")` except on onboarding completion —
that's the one legit full-tree revalidation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "$(cat <<'EOF'
docs(architecture): document 6-layer caching + tag taxonomy

One canonical place for "where does this cache and when does it bust?"
Mirror of the design spec's architecture section, promoted into the
project's primary architecture doc.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 2 gate

- [ ] `pnpm test --run` green
- [ ] `pnpm next lint` green
- [ ] `pnpm build` green
- [ ] Manual: load `/leaderboard`, check Supabase dashboard query log for
      one render — expect ≤ 5 queries (down from ~15).

---

## Phase 3 — Targeted tag revalidation

Each task in this phase replaces a cluster of `revalidatePath` calls
with `revalidateTag` calls. Tests update from asserting paths to
asserting tags. After the phase, `grep -n 'revalidatePath.*"/".*"layout"'
src/app` returns exactly 1 hit (`onboarding/actions.ts:75`).

### Task 3.1: Migrate `completeRoute` + `uncompleteRoute`

**Files:**
- Modify: `src/app/(app)/actions.ts:54-135`
- Modify: `src/app/(app)/actions.test.ts`

- [ ] **Step 1: Update the action**

In `completeRoute`, replace `revalidatePath("/", "layout");` with:

```ts
    // Derive setId from routeId so we can revalidate the set's
    // leaderboard tag precisely. One lookup; profile + stats tags are
    // already known (userId in scope).
    const { data: routeRow } = await supabase
      .from("routes")
      .select("set_id")
      .eq("id", routeId)
      .maybeSingle();
    if (routeRow?.set_id) {
      revalidateTag(`set:${routeRow.set_id}:leaderboard`);
    }
    revalidateTag(`user:${userId}:stats`);
    revalidateTag(`user:${userId}:profile`);
```

Update the top imports:

```ts
import { revalidatePath, revalidateTag } from "next/cache";
```

`revalidatePath` stays imported for any uses that remain (there will
be some in this file for now; they go away in later tasks).

Apply the same pattern to `uncompleteRoute`.

- [ ] **Step 2: Update tests**

In `src/app/(app)/actions.test.ts`, the mock block at the top:

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

Becomes:

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
```

Find any test that asserts `revalidatePath` was called with `"/", "layout"`
inside `completeRoute` / `uncompleteRoute` blocks. Update to assert
`revalidateTag` was called with the relevant tags. Example:

```ts
import { revalidateTag } from "next/cache";

it("revalidates leaderboard + user stats + user profile tags", async () => {
  // ... setup mocks
  await completeRoute("route1", 3, null, false);
  expect(revalidateTag).toHaveBeenCalledWith(expect.stringMatching(/^set:.*:leaderboard$/));
  expect(revalidateTag).toHaveBeenCalledWith("user:user1:stats");
  expect(revalidateTag).toHaveBeenCalledWith("user:user1:profile");
});
```

- [ ] **Step 3: Run the test file**

```bash
pnpm test --run src/app/\(app\)/actions.test.ts
```

Expected: green. Fix any other test that incidentally asserted on
`revalidatePath` calls that are now `revalidateTag`.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/actions.ts src/app/\(app\)/actions.test.ts
git commit -m "$(cat <<'EOF'
perf(actions): complete/uncomplete route revalidate tags, not path layout

Previously revalidatePath("/", "layout") scorched every user's router
cache subtree on every send — the root cause of "tap leaderboard
after logging feels cold". Now: set:{id}:leaderboard + user:{uid}:stats
+ user:{uid}:profile. Crew, admin, competitions untouched.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Migrate `updateGradeVote`

**Files:**
- Modify: `src/app/(app)/actions.ts:156-181`

- [ ] **Step 1: Update the action**

The current action has no `revalidatePath` — optimistic UI handles grade
changes. But the community grade DOES change via the trigger in
migration 026, which affects the cached `getRouteGrade`. Add:

```ts
    const log = await upsertRouteLog(supabase, userId, routeId, { grade_vote: gradeVote }, logId, gymId);
    revalidateTag(`set:route-${routeId}:routes`);
    return { success: true, log };
```

Ensure `revalidateTag` is imported.

- [ ] **Step 2: Test + commit**

```bash
pnpm test --run src/app/\(app\)/actions.test.ts
git add src/app/\(app\)/actions.ts
git commit -m "$(cat <<'EOF'
perf(actions): updateGradeVote revalidates route grade tag

Grade votes update routes.community_grade via trigger — previously
the cached getRouteGrade had no invalidation path, so route sheets
showed stale grades for up to 300s. Now targeted bust.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3: Migrate `switchActiveGym`

**Files:**
- Modify: `src/app/(app)/actions.ts:529-569`

- [ ] **Step 1: Update**

Replace `revalidatePath("/", "layout");` with:

```ts
    revalidateTag(`user:${userId}:profile`);
```

- [ ] **Step 2: Test + commit**

```bash
pnpm test --run src/app/\(app\)/actions.test.ts
git add src/app/\(app\)/actions.ts
git commit -m "$(cat <<'EOF'
perf(actions): switchActiveGym revalidates user profile tag only

Gym switch changes profiles.active_gym_id for the caller. No other
user is affected; their router cache stays intact.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.4: Migrate `updateProfile` + `updateTheme` in `user-actions.ts`

**Files:**
- Modify: `src/lib/user-actions.ts`

- [ ] **Step 1: Update `updateProfile`**

Replace `revalidatePath("/", "layout");` with:

```ts
    revalidateTag(`user:${userId}:profile`);
    // On username change, the old and new username-keyed cache entries
    // both carry the user's profile tag, so the single call busts both.
```

Check the getProfileByUsername tag format used in Task 2.5: it's
`user:username-{username}:profile`. The tag with `user:{uid}:profile`
format here doesn't match that cache entry. Fix by adding the
username-scoped bust:

```ts
    revalidateTag(`user:${userId}:profile`);
    if (payload.username) {
      // Old + new username-keyed entries
      const oldUsername = (await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .single()).data?.username;
      if (oldUsername) revalidateTag(`user:username-${oldUsername}:profile`);
      revalidateTag(`user:username-${payload.username}:profile`);
    }
```

Wait — by the time the query above runs, the update has already happened
(line order: update profile THEN read). We need the old username BEFORE
the update. Restructure:

```ts
  // Capture old username first so we can bust its cache entry on rename.
  let oldUsername: string | null = null;
  if (payload.username !== undefined) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();
    oldUsername = data?.username ?? null;
  }

  try {
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    if (error) return { error: formatError(error) };

    revalidateTag(`user:${userId}:profile`);
    if (payload.username && oldUsername && oldUsername !== payload.username) {
      revalidateTag(`user:username-${oldUsername}:profile`);
      revalidateTag(`user:username-${payload.username}:profile`);
    }
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
```

- [ ] **Step 2: Update `updateTheme`**

Find the function in `src/lib/user-actions.ts` (around line 90+ based
on the earlier read — if not present, it may be elsewhere; if not,
skip this sub-step). Replace any `revalidatePath("/", "layout")` with
`revalidateTag(\`user:${userId}:profile\`)`.

- [ ] **Step 3: Test + commit**

```bash
pnpm test --run src/lib/user-actions.test.ts
git add src/lib/user-actions.ts
git commit -m "$(cat <<'EOF'
perf(actions): updateProfile revalidates precise tags on rename

Captures old username pre-update so both old and new
user:username-{u}:profile cache entries bust. updateTheme narrows to
the owner's profile tag.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.5: Migrate `markNotificationsRead`

**Files:**
- Modify: `src/app/notifications-actions.ts:26, 55`

- [ ] **Step 1: Update**

Replace both `revalidatePath("/", "layout");` with:

```ts
    revalidateTag(`user:${userId}:notifications`);
```

The userId is in scope from the `requireSignedIn` / `requireAuth` result.

- [ ] **Step 2: Test + commit**

```bash
pnpm test --run src/app/notifications-actions.test.ts
git add src/app/notifications-actions.ts
git commit -m "$(cat <<'EOF'
perf(actions): markNotificationsRead narrows to user notifications tag

Previously nuked the whole layout to update a bell badge.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.6: Migrate crew actions

**Files:**
- Modify: `src/app/crew/actions.ts:60, 157, 227, 250, 304, 315, 410, 429`
- Modify: `src/app/crew/actions.test.ts`

Eight `revalidatePath("/crew", "layout")` sites to migrate. All crew
mutations affect at least the crew row and all active members' crew
list.

- [ ] **Step 1: Identify affected members per mutation**

Read `src/app/crew/actions.ts` and for each action (createCrew,
inviteToCrew, acceptInvite, declineInvite, removeMember, leaveCrew,
transferOwnership, — whatever's there), identify which user ids are
affected. For actions that know the full member list (stored in
`crew_members`), the action can query for all active members' ids
before returning and revalidate each user's `user:{id}:crews` tag.

- [ ] **Step 2: Pattern for each crew action**

Template — after each mutation's successful DB write, before returning:

```ts
  // Fetch active members so we can revalidate each one's crews tag.
  const { data: members } = await supabase
    .from("crew_members")
    .select("user_id")
    .eq("crew_id", crewId)
    .eq("status", "active");

  revalidateTag(`crew:${crewId}`);
  for (const m of members ?? []) {
    revalidateTag(`user:${m.user_id}:crews`);
  }
  // Notifications to a specific user (invite sent etc)
  // get a dedicated revalidateTag(`user:${recipientId}:notifications`).
```

Apply to each of the 8 `revalidatePath("/crew", "layout")` sites.
Specific per-action tag sets:

- `createCrew(crewId)` → `crew:{id}` + every member (initially just
  creator) → `user:{uid}:crews`.
- `inviteToCrew(crewId, inviteeUserId)` → `crew:{id}` + inviter's
  crews tag + `user:{inviteeUserId}:notifications`.
- `acceptInvite(crewId)` → `crew:{id}` + accepter's crews tag + every
  existing active member's crews tag + inviter's notifications tag.
- `declineInvite(crewId)` → `crew:{id}` + decliner's crews tag +
  inviter's notifications tag.
- `leaveCrew(crewId)` → `crew:{id}` + leaver's crews tag + every
  remaining active member's crews tag.
- `removeMember(crewId, removedUserId)` → `crew:{id}` +
  removedUserId's crews tag + every remaining active member's crews
  tag + removed user's notifications tag (if we push a notif).
- `transferOwnership(crewId, newOwnerId)` → `crew:{id}` + both
  parties' `user:{uid}:crews` + new owner's
  `user:{uid}:notifications`.

- [ ] **Step 3: Update tests**

In `crew/actions.test.ts`, replace the mock top line with both
`revalidatePath` and `revalidateTag`. Update assertions: where tests
checked `revalidatePath("/crew", "layout")`, assert
`revalidateTag("crew:...")` + per-member `user:...:crews` tags.

Example test for `createCrew`:

```ts
expect(revalidateTag).toHaveBeenCalledWith(`crew:${createdCrewId}`);
expect(revalidateTag).toHaveBeenCalledWith(`user:${mockAuth.userId}:crews`);
```

- [ ] **Step 4: Test + commit**

```bash
pnpm test --run src/app/crew/actions.test.ts
git add src/app/crew/actions.ts src/app/crew/actions.test.ts
git commit -m "$(cat <<'EOF'
perf(crew): tag-based revalidation for all eight crew mutations

Previously each mutation scorched /crew, "layout" — all crew data plus
picker + detail + settings even when only one member's view changed.
Now: crew:{id} + per-affected-member user:{uid}:crews + any
notifications tags. Fan-out is explicit per action.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.7: Migrate admin actions (part 1 — set mutations)

**Files:**
- Modify: `src/app/admin/actions.ts:244, 304, 385, 413, 432`
- Modify: `src/app/(app)/admin-actions.ts:75, 111`
- Modify: `src/app/admin/actions.test.ts`

Seven `revalidatePath("/", "layout")` / `revalidatePath("/admin", "layout")`
sites for set + admin operations.

- [ ] **Step 1: Map each action to its tags**

- `createSet(gymId)` → `gym:{gymId}:active-set`
- `updateSet(setId)` → `gym:{gymId}:active-set` (if status changed) +
  `set:{setId}:routes` (if it affects route layout)
- `archiveSet(setId)` / `goLive(setId)` → `gym:{gymId}:active-set` +
  `set:{setId}:leaderboard` (rank semantics)
- Any admin action in `(app)/admin-actions.ts` (read the file first):
  `assumeGym` → `user:{userId}:profile`

Resolve the `gymId` from the `setId` via one DB read if not already
in scope.

- [ ] **Step 2: Update each site**

Pattern:

```ts
// Before
revalidatePath("/admin", "layout");
revalidatePath("/", "layout");

// After
revalidateTag(`gym:${gymId}:active-set`);
revalidateTag(`set:${setId}:routes`); // only if routes may have changed
// etc.
```

- [ ] **Step 3: Update tests**

In `admin/actions.test.ts`, add `revalidateTag: vi.fn()` to the mock
block and update assertions.

- [ ] **Step 4: Test + commit**

```bash
pnpm test --run src/app/admin/actions.test.ts
pnpm test --run src/app/\(app\)/admin-actions.test.ts
git add src/app/admin/actions.ts src/app/admin/actions.test.ts \
        src/app/\(app\)/admin-actions.ts
git commit -m "$(cat <<'EOF'
perf(admin): set mutations revalidate gym/set tags, not layout paths

A gym admin publishing a set no longer scorches every climber's
router cache in that gym.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.8: Migrate admin actions (part 2 — route + competition mutations)

**Files:**
- Modify: `src/app/admin/actions.ts` (remaining 11 `revalidatePath("/admin", "layout")`)

- [ ] **Step 1: Route mutations**

For `createRoute`, `updateRoute`, `deleteRoute`, `reorderRoutes`:

```ts
revalidateTag(`set:${setId}:routes`);
```

If the route's grade baseline changes: also
`revalidateTag(\`set:route-${routeId}:routes\`)`.

- [ ] **Step 2: Competition admin mutations**

For `linkCompetitionGym`, `unlinkCompetitionGym`, `updateCompetition`,
`createCompetitionCategory`, `deleteCompetitionCategory`:

```ts
revalidateTag(`competition:${competitionId}`);
```

- [ ] **Step 3: Confirm the grep check**

```bash
grep -rn 'revalidatePath.*"/".*"layout"' src/app
```

Expected: exactly one hit — `src/app/onboarding/actions.ts:75`.

If additional hits remain, locate and migrate each, adding lines to
this task or creating a follow-up task as needed.

- [ ] **Step 4: Test + commit**

```bash
pnpm test --run
git add src/app/admin/actions.ts src/app/admin/actions.test.ts
git commit -m "$(cat <<'EOF'
perf(admin): route + competition admin mutations revalidate precise tags

Grep check: revalidatePath.*"/".*"layout" returns one hit — onboarding
finish, which legitimately transitions a user into the app.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 3 gate

- [ ] `pnpm test --run` green
- [ ] `pnpm next lint` green
- [ ] `pnpm build` green
- [ ] Grep: `grep -rn 'revalidatePath.*"/".*"layout"' src/app` returns
      one hit (`onboarding/actions.ts`).

---

## Phase 4 — Profile streaming + summary migration

### Task 4.1: Extract `ProfileStats` async server component

**Files:**
- Create: `src/app/u/[username]/_components/ProfileStats.tsx`
- Create: `src/app/u/[username]/_components/ProfileStats.skeleton.tsx`

- [ ] **Step 1: Write `ProfileStats`**

Create `src/app/u/[username]/_components/ProfileStats.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileSummary,
  getGym,
  getLeaderboardUserRow,
  getCurrentSet,
} from "@/lib/data/queries";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
import {
  computeAllTimeAggregates,
  flashRate,
  pointsPerSend,
  completionRate,
  computeSetStreak,
} from "@/lib/data/profile-stats";
import { format, parseISO } from "date-fns";

interface Props {
  userId: string;
  gymId: string;
  /** For own-profile rendering, ClimberStats shows the current-set zoom. */
  isOwnProfile: boolean;
}

export async function ProfileStats({ userId, gymId, isOwnProfile }: Props) {
  const supabase = await createServerSupabase();
  const [summary, activeSet, gym] = await Promise.all([
    getProfileSummary(supabase, userId, gymId),
    getCurrentSet(gymId),
    getGym(gymId),
  ]);

  // Derive all-time aggregates from per-set rows (no raw logs needed).
  const aggregates = {
    sends: summary.per_set.reduce((acc, s) => acc + s.sends, 0),
    flashes: summary.per_set.reduce((acc, s) => acc + s.flashes, 0),
    zones: summary.per_set.reduce((acc, s) => acc + s.zones, 0),
    points: summary.per_set.reduce((acc, s) => acc + s.points, 0),
    uniqueRoutesAttempted: new Set(summary.active_set_detail.map(d => d.route_id)).size,
    totalAttempts: summary.active_set_detail.reduce((acc, d) => acc + d.attempts, 0),
  };

  const rankRow = activeSet
    ? await getLeaderboardUserRow(gymId, userId, activeSet.id)
    : null;

  const streak = computeSetStreak(
    summary.per_set.map(ps => ({ hasSend: ps.sends > 0 })),
  );

  const allTimeExtras = {
    flashRate: flashRate(aggregates.sends, aggregates.flashes),
    pointsPerSend: pointsPerSend(aggregates.points, aggregates.sends),
    totalAttempts: aggregates.totalAttempts,
    completionRate: completionRate(aggregates.sends, aggregates.uniqueRoutesAttempted),
    uniqueRoutesAttempted: aggregates.uniqueRoutesAttempted,
    totalRoutesInGym: summary.total_routes_in_gym,
    streakCurrent: streak.current,
    streakBest: streak.best,
  };

  // Routes needed for ClimberStats' per-tile props + the current-set
  // totalRoutes count. Fetched alongside the summary rather than
  // sequenced after it — routes-by-set uses its own server cache tag.
  const routes = activeSet ? await getRoutesBySet(activeSet.id) : [];
  const logsByRoute = new Map(
    summary.active_set_detail.map(d => [d.route_id, d])
  );

  const currentSetStats = activeSet
    ? (() => {
        const perSet = summary.per_set.find(s => s.set_id === activeSet.id) ?? {
          sends: 0, flashes: 0, zones: 0, points: 0,
        };
        return {
          ...perSet,
          completions: perSet.sends,
          totalRoutes: routes.length,
          resetDate: format(parseISO(activeSet.ends_at), "MMM d"),
          rank: rankRow?.rank ?? null,
        };
      })()
    : null;

  return (
    <ClimberStats
      currentSet={currentSetStats}
      allTimeCompletions={aggregates.sends}
      allTimeFlashes={aggregates.flashes}
      allTimePoints={aggregates.points}
      allTimeExtras={allTimeExtras}
      gymName={gym?.name}
      routeIds={routes.length > 0 ? routes.map(r => r.id) : undefined}
      routeHasZone={routes.length > 0 ? routes.map(r => r.has_zone) : undefined}
      routeNumbers={routes.length > 0 ? routes.map(r => r.number) : undefined}
      logs={routes.length > 0
        ? new Map(
            routes.map(r => [
              r.id,
              logsByRoute.get(r.id) ?? { attempts: 0, completed: false, zone: false, route_id: r.id },
            ]),
          )
        : undefined}
    />
  );
}
```

Add the `getRoutesBySet` import at the top of the file:

```ts
import { getRoutesBySet } from "@/lib/data/queries";
```

- [ ] **Step 2: Write the skeleton**

Create `src/app/u/[username]/_components/ProfileStats.skeleton.tsx`:

```tsx
import { CardSkeleton } from "@/components/ui";

export function ProfileStatsSkeleton() {
  return (
    <>
      <CardSkeleton height="21rem" ariaLabel="Loading all-time stats" />
      <CardSkeleton height="18rem" ariaLabel="Loading current set" />
    </>
  );
}
```

- [ ] **Step 3: Commit — component not yet wired in**

```bash
git add src/app/u/\[username\]/_components/ProfileStats.tsx \
        src/app/u/\[username\]/_components/ProfileStats.skeleton.tsx
git commit -m "$(cat <<'EOF'
feat(profile): extract ProfileStats async server component

Reads get_profile_summary + getRoutesBySet inside the component so its
Suspense boundary can stream independently from the shell. Not yet
wired into page.tsx — next task restructures the page.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.2: Extract `ProfileAchievementsSection` async server component

**Files:**
- Create: `src/app/u/[username]/_components/ProfileAchievementsSection.tsx`

- [ ] **Step 1: Write**

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileSummary,
  getEarnedAchievements,
  getRoutesBySet,
  getAllSets,
  getRoutesBySetIds,
} from "@/lib/data/queries";
import { evaluateBadges } from "@/lib/badges";
import { ProfileAchievements } from "@/components/Achievements/ProfileAchievements";

interface Props {
  userId: string;
  gymId: string;
  createdAt: string;
}

export async function ProfileAchievementsSection({ userId, gymId, createdAt }: Props) {
  const supabase = await createServerSupabase();
  const [summary, earnedAchievements, allSets] = await Promise.all([
    getProfileSummary(supabase, userId, gymId),
    getEarnedAchievements(supabase, userId),
    getAllSets(gymId, createdAt),
  ]);

  const activeSet = allSets.find(s => s.active);
  const previousSets = allSets.filter(s => !s.active);

  // Need per-set route info for condition-based badges.
  const [activeRoutes, previousRoutesBySet] = await Promise.all([
    activeSet ? getRoutesBySet(activeSet.id) : Promise.resolve([]),
    getRoutesBySetIds(supabase, previousSets.map(s => s.id)),
  ]);

  // Build the per-set maps evaluateBadges expects (code adapted from
  // the previous page.tsx inline loop).
  const completedRoutesBySet = new Map<string, Set<number>>();
  const flashedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();
  const zoneAvailableBySet = new Map<string, Set<number>>();
  const zoneClaimedBySet = new Map<string, Set<number>>();

  const registerSet = (setId: string, routes: Array<{ id: string; number: number; has_zone: boolean }>) => {
    totalRoutesBySet.set(setId, routes.length);
    const routeNumberById = new Map(routes.map(r => [r.id, r.number]));
    const zoneAvailable = new Set<number>();
    for (const r of routes) if (r.has_zone) zoneAvailable.add(r.number);
    zoneAvailableBySet.set(setId, zoneAvailable);

    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneClaimed = new Set<number>();

    // The summary only contains active-set raw logs. Previous-set
    // per-route state is reconstructed from the aggregate counts —
    // badges that require specific route numbers for past sets used
    // to look up routeData.logs; now we only have counts. Accept the
    // trade-off: count-based badges (total flashes, sends, etc) work
    // from summary.per_set; route-number-specific badges fall back to
    // active-set evaluation only. (This matches the intent — past-set
    // badges are persisted via `earnedAchievements` and never re-evaluated.)

    if (setId === activeSet?.id) {
      // Active set has per-route detail.
      for (const log of summary.active_set_detail) {
        const num = routeNumberById.get(log.route_id);
        if (num === undefined) continue;
        if (log.zone) zoneClaimed.add(num);
        if (!log.completed) continue;
        completed.add(num);
        if (log.attempts === 1) flashed.add(num);
      }
    }
    completedRoutesBySet.set(setId, completed);
    flashedRoutesBySet.set(setId, flashed);
    zoneClaimedBySet.set(setId, zoneClaimed);
  };

  if (activeSet) registerSet(activeSet.id, activeRoutes);
  for (const set of previousSets) {
    const routes = previousRoutesBySet.get(set.id) ?? [];
    registerSet(set.id, routes);
  }

  const totals = {
    sends: summary.per_set.reduce((acc, s) => acc + s.sends, 0),
    flashes: summary.per_set.reduce((acc, s) => acc + s.flashes, 0),
    points: summary.per_set.reduce((acc, s) => acc + s.points, 0),
  };

  const badges = evaluateBadges({
    totalFlashes: totals.flashes,
    totalSends: totals.sends,
    totalPoints: totals.points,
    completedRoutesBySet,
    totalRoutesBySet,
    flashedRoutesBySet,
    zoneAvailableBySet,
    zoneClaimedBySet,
  }).map(b => {
    if (b.earned) {
      const earnedAt = earnedAchievements.get(b.badge.id);
      return earnedAt ? { ...b, earnedAt } : b;
    }
    return b;
  });

  return <ProfileAchievements badges={badges} />;
}

export function ProfileAchievementsSkeleton() {
  return null; // or minimal shimmer; achievements are below the fold
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/u/\[username\]/_components/ProfileAchievementsSection.tsx
git commit -m "$(cat <<'EOF'
feat(profile): extract ProfileAchievementsSection streaming component

Reads profile summary + sets + route details needed for condition-based
badge evaluation. Streams under its own Suspense boundary.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.3: Extract `PreviousSetsSection`

**Files:**
- Create: `src/app/u/[username]/_components/PreviousSetsSection.tsx`

- [ ] **Step 1: Write**

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileSummary,
  getAllSets,
  getRoutesBySet,
  getRoutesBySetIds,
} from "@/lib/data/queries";
import { PreviousSetsGrid } from "@/components/sections/PreviousSetsGrid";
import type { SetCell } from "@/components/sections/PreviousSetsGrid";
import { computeMaxPoints } from "@/lib/data";
import { evaluateBadgesForSet } from "@/lib/badges";
import { format, parseISO } from "date-fns";
import type { Route } from "@/lib/data";

interface Props {
  userId: string;
  gymId: string;
  createdAt: string;
}

function formatSetLabel(starts: string, ends: string) {
  return [
    format(parseISO(starts), "MMM d").toUpperCase(),
    format(parseISO(ends), "MMM d").toUpperCase(),
  ].join(" – ");
}

export async function PreviousSetsSection({ userId, gymId, createdAt }: Props) {
  const supabase = await createServerSupabase();
  const [summary, allSets] = await Promise.all([
    getProfileSummary(supabase, userId, gymId),
    getAllSets(gymId, createdAt),
  ]);

  const activeSet = allSets.find(s => s.active) ?? null;
  const previousSetRecords = allSets.filter(s => !s.active);

  const [activeRoutes, previousRoutesBySet] = await Promise.all([
    activeSet ? getRoutesBySet(activeSet.id) : Promise.resolve<Route[]>([]),
    getRoutesBySetIds(supabase, previousSetRecords.map(s => s.id)),
  ]);

  const showSetsEmpty = activeSet !== null && previousSetRecords.length === 0;

  function buildSetCell(
    setRecord: { id: string; starts_at: string; ends_at: string },
    routes: Route[],
    isActive: boolean,
  ): SetCell {
    const stats = summary.per_set.find(s => s.set_id === setRecord.id) ?? {
      sends: 0, flashes: 0, zones: 0, points: 0,
    };
    const totalRoutes = routes.length;
    const maxPoints = computeMaxPoints(totalRoutes, routes.filter(r => r.has_zone).length);

    const logs = new Map<string, { attempts: number; completed: boolean; zone: boolean }>();
    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneAvailable = new Set<number>();
    const zoneClaimed = new Set<number>();

    for (const r of routes) if (r.has_zone) zoneAvailable.add(r.number);

    if (isActive) {
      for (const log of summary.active_set_detail) {
        const route = routes.find(r => r.id === log.route_id);
        if (!route) continue;
        logs.set(log.route_id, { attempts: log.attempts, completed: log.completed, zone: log.zone });
        if (log.zone) zoneClaimed.add(route.number);
        if (!log.completed) continue;
        completed.add(route.number);
        if (log.attempts === 1) flashed.add(route.number);
      }
    }

    const badgesForSet = evaluateBadgesForSet({
      completed,
      flashed,
      zoneAvailable,
      zoneClaimed,
      totalRoutes,
    });

    return {
      id: setRecord.id,
      label: formatSetLabel(setRecord.starts_at, setRecord.ends_at),
      isActive,
      hasActivity: stats.sends > 0 || (isActive && summary.active_set_detail.some(l => l.attempts > 0)),
      completions: stats.sends,
      flashes: stats.flashes,
      zones: stats.zones,
      points: stats.points,
      totalRoutes,
      maxPoints,
      routes,
      logs,
      badges: badgesForSet,
    };
  }

  const setCells: SetCell[] = [];
  if (activeSet) setCells.push(buildSetCell(activeSet, activeRoutes, true));
  for (const set of previousSetRecords) {
    const routes = previousRoutesBySet.get(set.id) ?? [];
    setCells.push(buildSetCell(set, routes, false));
  }

  return (
    <PreviousSetsGrid
      sets={setCells}
      gymId={gymId}
      userId={userId}
      showEmptyState={showSetsEmpty}
    />
  );
}

export function PreviousSetsSkeleton() {
  // Match the existing CardSkeleton pattern from loading.tsx
  // Height approximates the grid when populated.
  return <div className="previous-sets-skeleton" aria-busy="true" style={{ height: "16rem" }} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/u/\[username\]/_components/PreviousSetsSection.tsx
git commit -m "$(cat <<'EOF'
feat(profile): extract PreviousSetsSection streaming component

Encapsulates per-set stat derivation and the previous-sets grid,
allowing it to stream below the stats card.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.4: Extract `OwnProfileExtras`

**Files:**
- Create: `src/app/u/[username]/_components/OwnProfileExtras.tsx`

- [ ] **Step 1: Write**

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { getPendingCrewInvites } from "@/lib/data/crew-queries";
import { getAdminGymsForUser } from "@/lib/data/admin-queries";
import { getNotifications } from "@/lib/data/notifications";

interface Props {
  userId: string;
  /** The header component accepts these as props — this component
   *  pipes the data up via a render prop / context / or the page
   *  composes the header with this data. Simplest: render nothing
   *  here, return the data as a Promise to be read in the shell.
   *
   *  Since server components can't lift data to a parent directly,
   *  this is merged back into the header via a new wrapper element
   *  that the page.tsx renders. Implement as a data-bearing
   *  component: renders into a slot that the header references.
   */
}

// Simplest approach: fetch here, render nothing, but expose data via
// a shared context? No — server components don't do that. Instead,
// the page renders the header ONLY after these awaits complete.
// That's fine because the header also needs profileUser (already
// fetched in the shell). So the own-profile extras are passed INTO
// the header.
//
// Practical approach: fold this fetching BACK into the shell for own
// profile only. Don't stream owner-only data — the owner sees their
// own profile fast anyway (middleware cookie hits).
//
// Decision: delete this component; own-profile extras stay in
// page.tsx shell for own profile, streamed children only for viewing
// others'. Phase 4.5 will handle this branch.

export async function OwnProfileExtras(_props: Props) {
  throw new Error("See Task 4.5 — folded back into page.tsx shell");
}
```

- [ ] **Step 2: Decision — delete this file**

Based on the analysis above, own-profile header extras (pending crew
invites, admin link, notifications) stay in the page shell. They don't
need to stream — the owner's cold load is already fast (middleware
already validated auth). Remove this file:

```bash
rm src/app/u/\[username\]/_components/OwnProfileExtras.tsx
```

- [ ] **Step 3: Commit the decision**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(profile): decide own-profile extras stay in shell, don't stream

Task 4.4 exploration concluded the own-profile bell + invites +
admin link don't benefit from streaming: they're only shown to the
owner, who already has a fast render path via the middleware cookie.
Keeps streaming complexity focused on cross-user profile views.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.5: Restructure `/u/[username]/page.tsx` as shell + Suspense boundaries

**Files:**
- Modify: `src/app/u/[username]/page.tsx` (major rewrite)

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/u/[username]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/data/queries";
import { getCrewCountForUser, getPendingCrewInvites } from "@/lib/data/crew-queries";
import { getAdminGymsForUser } from "@/lib/data/admin-queries";
import { getNotifications } from "@/lib/data/notifications";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { CardSkeleton } from "@/components/ui";
import { ProfileStats } from "./_components/ProfileStats";
import { ProfileStatsSkeleton } from "./_components/ProfileStats.skeleton";
import { ProfileAchievementsSection } from "./_components/ProfileAchievementsSection";
import { PreviousSetsSection, PreviousSetsSkeleton } from "./_components/PreviousSetsSection";
import styles from "./user.module.scss";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `@${username} - Chork` };
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;

  // Profile lookup is cache()-wrapped at both React render layer and
  // server-cache layer, so metadata + this component share the hit.
  const profileUser = await getProfileByUsername(username);
  if (!profileUser) notFound();

  const authUser = await getServerUser();
  const isOwnProfile = authUser?.id === profileUser.id;

  const gymId = profileUser.active_gym_id;

  if (!gymId) {
    return (
      <main className={styles.page}>
        <ProfileHeader user={profileUser} isOwnProfile={isOwnProfile} />
        <p>No gym selected</p>
      </main>
    );
  }

  // Own-profile extras live in the shell (see Task 4.4 decision).
  // Fetched in parallel with the Suspense'd children.
  const ownExtrasPromise = isOwnProfile
    ? (async () => {
        const supabase = await createServerSupabase();
        const [invites, adminGyms, notifications] = await Promise.all([
          getPendingCrewInvites(supabase, profileUser.id),
          getAdminGymsForUser(supabase, profileUser.id),
          getNotifications(supabase, 50),
        ]);
        return { invites, adminGyms, notifications };
      })()
    : Promise.resolve({ invites: [], adminGyms: [] as [], notifications: [] });

  const crewCountPromise = !isOwnProfile
    ? (async () => {
        const supabase = await createServerSupabase();
        return getCrewCountForUser(supabase, profileUser.id);
      })()
    : Promise.resolve(0);

  const [ownExtras, crewCount] = await Promise.all([ownExtrasPromise, crewCountPromise]);
  const isAdmin = ownExtras.adminGyms.length > 0;

  const contextLine = !isOwnProfile && crewCount > 0
    ? `${crewCount} crew${crewCount === 1 ? "" : "s"}`
    : null;

  const otherThemeAttr =
    !isOwnProfile && profileUser.theme && profileUser.theme !== "default"
      ? { "data-theme": profileUser.theme }
      : {};

  return (
    <main className={styles.page} {...otherThemeAttr}>
      <ProfileHeader
        user={profileUser}
        isOwnProfile={isOwnProfile}
        contextLine={contextLine}
        invites={ownExtras.invites}
        notifications={ownExtras.notifications}
        isAdmin={isAdmin}
      />

      <Suspense fallback={<ProfileStatsSkeleton />}>
        <ProfileStats
          userId={profileUser.id}
          gymId={gymId}
          isOwnProfile={isOwnProfile}
        />
      </Suspense>

      <Suspense fallback={<CardSkeleton height="8rem" ariaLabel="Loading achievements" />}>
        <ProfileAchievementsSection
          userId={profileUser.id}
          gymId={gymId}
          createdAt={profileUser.created_at}
        />
      </Suspense>

      <Suspense fallback={<PreviousSetsSkeleton />}>
        <PreviousSetsSection
          userId={profileUser.id}
          gymId={gymId}
          createdAt={profileUser.created_at}
        />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 2: Run tests + lint + build**

```bash
pnpm test --run
pnpm next lint
pnpm build
```

Expected: all green.

- [ ] **Step 3: Dev-server smoke test**

```bash
pnpm dev
```

- Visit `/u/<your-username>` — shell should paint immediately; stats,
  achievements, and previous-sets cards should flash their skeletons
  then fill in.
- Visit another user's profile — same pattern plus their theme applied.
- Visit `/u/doesnotexist` — should 404.

- [ ] **Step 4: Commit**

```bash
git add src/app/u/\[username\]/page.tsx \
        src/app/u/\[username\]/_components/
git commit -m "$(cat <<'EOF'
perf(profile): stream stats + achievements + previous sets

Shell (header) paints as soon as the profile row resolves. Stats,
achievements, and sets stream under individual Suspense boundaries.
Heavy JS aggregation moves into each streamed component — it's off
the shell's critical path.

get_profile_summary RPC replaces the raw-log fetch + JS reducer.
Three Suspense boundaries means three independent skeleton → content
transitions, matching the loading.tsx skeleton card layout so there's
no layout shift.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.6: Migrate leaderboard neighbourhood to streamed component

**Files:**
- Create: `src/app/leaderboard/_components/NeighbourhoodStreamed.tsx`
- Modify: `src/app/leaderboard/page.tsx`

- [ ] **Step 1: Write the streamed component**

Create `src/app/leaderboard/_components/NeighbourhoodStreamed.tsx`:

```tsx
import { getLeaderboardNeighbourhood } from "@/lib/data/queries";
import { NeighbourhoodSection } from "@/components/Leaderboard/NeighbourhoodSection";

interface Props {
  gymId: string;
  userId: string;
  setId: string | null;
  /** If the user is in the top 5, we don't render a neighbourhood. */
  rankHint: number | null;
  currentUserId: string;
}

export async function NeighbourhoodStreamed({
  gymId,
  userId,
  setId,
  rankHint,
  currentUserId,
}: Props) {
  if (rankHint === null || rankHint <= 5) return null;
  const rows = await getLeaderboardNeighbourhood(gymId, userId, setId);
  if (rows.length === 0) return null;
  return <NeighbourhoodSection rows={rows} currentUserId={currentUserId} onPress={() => {}} />;
}
```

Note: `NeighbourhoodSection` takes an `onPress` handler. It's
client-side. To keep this component server-only for streaming, we
need `NeighbourhoodSection` itself to accept a server-rendered list
and let the leaderboard client view handle row interactions. This may
require a small refactor of `NeighbourhoodSection` or passing through
a wrapped interaction handler. If refactoring is complex, skip this
task and leave the neighbourhood fetch sync — the user-facing impact
is small (only ranked-user pages benefit) compared to the profile
streaming in Task 4.5.

- [ ] **Step 2: Wire into `page.tsx`**

Modify `src/app/leaderboard/page.tsx`:

Remove the conditional neighbourhood fetch (lines 43-48 in the
pre-Phase-2 file). Pass `rankHint` to the streamed component instead.
Since `LeaderboardView` is a client component that expects
`initialSetData.neighbourhood` as a prop, it becomes awkward to
stream around it. Simplest safe path:

- Keep neighbourhood in `initialSetData` for now, OR
- Only stream if `LeaderboardView` can be split into a server-rendered
  header + client tab widgets.

If the refactor is non-trivial, defer to a follow-up task and note it
in the plan status. **Recommendation: skip Task 4.6 this sprint.**
The leaderboard's perceived speed is dominated by the 8→1 query
reduction (Task 2.7) and the router cache not getting scorched (Phase 3).
Streaming neighbourhood is icing.

- [ ] **Step 3: Mark as deferred, commit an empty marker**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(plan): defer leaderboard neighbourhood streaming

Task 4.6 requires refactoring LeaderboardView to split server-rendered
top-5 + client interaction layer. Deferred to a follow-up: perceived-
speed win is minor next to the 8→1 query cut (Task 2.7) and the
revalidateTag migration (Phase 3).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 4 gate

- [ ] `pnpm test --run` green
- [ ] `pnpm next lint` green
- [ ] `pnpm build` green
- [ ] Manual: profile page shell renders within 400ms of navigation
      on warm cache (DevTools Performance panel).

---

## Phase 5 — Tune + polish

### Task 5.1: Lower `staleTimes.dynamic` from 300 to 60

**Files:**
- Modify: `next.config.ts:78`

- [ ] **Step 1: Update config**

Change `next.config.ts:78` from:

```ts
      dynamic: 300,
```

to:

```ts
      // Client router cache TTL. 60s is enough to cover normal
      // tab-back navigation within an active session, short enough
      // that other users' changes (now invalidated via
      // revalidateTag) appear without a hard refresh.
      dynamic: 60,
```

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "$(cat <<'EOF'
perf(config): lower staleTimes.dynamic 300 → 60

With Phase 3 tag-based mutations in place, the client router cache
no longer gets scorched on unrelated actions — 60s is a better
balance between "snappy during my session" and "see other users'
updates soon".

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.2: Plumb `priority` through `UserAvatar` + above-the-fold images

**Files:**
- Modify: `src/components/ui/UserAvatar.tsx`
- Modify: `src/components/ProfileHeader/ProfileHeader.tsx`
- Modify: `src/components/Leaderboard/Podium.tsx`

- [ ] **Step 1: Confirm UserAvatar already has priority prop**

From the earlier read: `UserAvatar.tsx:14, 38` already accepts
`priority`. If it doesn't, add it:

```tsx
interface Props {
  // ...existing props
  priority?: boolean;
}

export function UserAvatar({ priority, ... }: Props) {
  return (
    <Image
      // ...existing props
      priority={priority}
    />
  );
}
```

- [ ] **Step 2: Set `priority` on `ProfileHeader`'s avatar**

Find the `<UserAvatar>` usage inside `ProfileHeader.tsx` and add
`priority` prop:

```tsx
<UserAvatar user={user} size={/* ... */} priority />
```

This is above-the-fold on the profile page and contributes to LCP.

- [ ] **Step 3: Set `priority` on `Podium.tsx` top-1 avatar**

Only the #1 position is guaranteed above-the-fold on mobile. Find the
first-place avatar render and add `priority`:

```tsx
<UserAvatar user={toAvatarUser(first)} size={podiumAvatarSize} priority />
```

- [ ] **Step 4: Test + commit**

```bash
pnpm test --run
pnpm next lint
git add src/components/ui/UserAvatar.tsx \
        src/components/ProfileHeader/ProfileHeader.tsx \
        src/components/Leaderboard/Podium.tsx
git commit -m "$(cat <<'EOF'
perf(images): priority avatars on profile header + podium #1

Above-the-fold images should contribute to LCP, not lazy-load after
it. Kept other podium positions + leaderboard rows on default
(lazy) loading so off-screen climbers don't compete for the initial
connection budget.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 5 gate

- [ ] `pnpm test --run` green
- [ ] `pnpm next lint` green
- [ ] `pnpm build` green
- [ ] Manual Lighthouse run on `/u/<username>` — LCP < 2.5s on
      simulated 4G.

---

## Final acceptance check

Run from the repo root:

- [ ] `pnpm test --run` — all green
- [ ] `pnpm next lint` — clean
- [ ] `pnpm build` — clean
- [ ] `grep -rn 'revalidatePath.*"/".*"layout"' src/app` — exactly one
      hit (`onboarding/actions.ts`)
- [ ] Load `/leaderboard` cold; count Supabase round trips in the
      dashboard — expect ≤ 5
- [ ] Load `/u/<username>` cold; shell visible < 400ms warm
      (`staleTimes.dynamic=60` cached)
- [ ] Tap the Chorkboard tab after logging a send — page data present
      instantly from router cache, not cold-fetched
- [ ] `docs/architecture.md` has a "Caching architecture" section with
      the 6-layer table + tag taxonomy

When every box above is checked, the phase sweep is complete.

---

## Post-sprint

- Update `docs/roadmap.md` — move the loading/caching rework into
  Shipped; Next 16 upgrade stays under Next up.
- Schedule the Next 16 upgrade sprint — `unstable_cache` migrates to
  `"use cache"` directive mechanically.
