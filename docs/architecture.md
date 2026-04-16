# Architecture

Living doc. CLAUDE.md summarises; this file details. Keep them in
sync when a pattern changes.

---

## The data access boundary

Components never talk to Supabase directly. Every read goes through a
`src/lib/data/*-queries.ts` function; every write through
`src/lib/data/*-mutations.ts` or a server action. This keeps RLS
enforcement auditable and mocks trivial.

```
Server component / server action
        │
        ├── (reads)    src/lib/data/queries.ts
        ├── (admin r.) src/lib/data/admin-queries.ts
        ├── (crew r.)  src/lib/data/crew-queries.ts
        ├── (admin w.) src/lib/data/admin-mutations.ts
        └── (writes)   src/lib/data/mutations.ts
                                │
                                └── Supabase client (RLS applies)
```

**Rule**: if you reach for a raw Supabase call from a component, you're
doing it wrong — add a helper instead.

### Passing `supabase` as first arg

Every data function takes the Supabase client as its first argument
rather than calling `createServerSupabase()` internally. Two reasons:

1. Tests mock the client at the call site without module-level
   patching
2. Server actions already hold an authed client from `requireAuth` —
   re-creating one would break React's per-render cache

### Client vs server separation

- `src/lib/supabase/server.ts` has `import "server-only"` at the
  top — any attempt to import it from a `"use client"` file errors
  at build time
- `src/lib/data/queries.ts` is also marked `"server-only"` where
  needed. Query helpers that need to run in the browser (e.g.
  `getCrewActivityFeed` paging) are called with a browser client
- If you need the same shape of data in both contexts, inline the
  query in the client component rather than importing a server-only
  helper

### Read vs mutation error contract

Codified at the top of `src/lib/data/queries.ts` and
`src/lib/data/mutations.ts`:

- **Reads** (`*-queries.ts`) swallow Postgres errors, log to console,
  return a neutral fallback (`null` / `[]`). Render paths handle
  "absent" the same as "failed", so callers don't need try/catch.
- **Mutations** (`*-mutations.ts`) throw on error. The server-action
  caller wraps in try/catch and forwards via `formatError(err)` —
  that's where the friendly mapping ([src/lib/errors.ts]) sanitises
  the message before it leaves the server.

Don't blur the line: a silent-swallow on a mutation lets the caller
think the write succeeded and skip its post-write tag busts / push
dispatch / activity log.

---

## Auth flow

### On request (middleware)

1. `createMiddlewareSupabase(request)` opens a per-request client
2. `supabase.auth.getUser()` — validates the session JWT
3. Public / auth routes bypass further checks
4. Authenticated users visiting any other route: check the
   `chork-onboarded=<uid>:1` cookie. If present, skip the profile
   query entirely. If absent, query `profiles.onboarded` and set the
   cookie on success
5. Unauthenticated → `/login`. Not onboarded → `/onboarding`.
   Everyone else falls through

### On render (RSC)

1. `getServerUser()` — `cache()`-wrapped, one auth round-trip per
   render regardless of how many callers ask
2. `getServerProfile()` — same pattern for the profiles row
3. `requireAuth()` / `requireSignedIn()` / `requireGymAdmin()` all
   read through those two helpers so a page that invokes multiple
   auth checks in one tree still only hits auth once

### On client (AuthProvider)

`src/lib/auth-context.tsx` uses Supabase's session helper. Root
layout passes a server-fetched `initialProfile` through Providers,
so the `NavBar` renders the correct logged-in state on first paint
— no logged-out flash. Subsequent auth events come through the
standard supabase `onAuthStateChange` subscription.

---

## Multi-tenancy (gym isolation)

Every gym-scoped table has a `gym_id` column. Writes that need gym
scoping write it explicitly; reads rely on RLS.

- `is_gym_member(gym_id)` — SELECT gate for `sets`, `routes`,
  `route_logs`, `comments`, `activity_events`, `comment_likes`
- `is_gym_admin(gym_id)` — admin ops (set / route CRUD,
  dashboard RPCs). Reads `gym_admins`, not `gym_memberships.role`
- `is_gym_owner(gym_id)` — owner-only ops (managing other admins).
  Same source
- `is_competition_organiser(comp_id)` — organiser ops on
  competitions / categories

All helpers are `SECURITY DEFINER` with `search_path = ''` — see
`docs/db-audit.md` for why this matters.

### Denormalised `gym_id` on high-traffic tables

`route_logs`, `comments`, `comment_likes`, `activity_events` all
carry `gym_id` as a denormalised column even though they could
derive it through joins. This is intentional — it lets the
`is_gym_member(gym_id)` RLS check run without a join and uses an
index. See migration 002 for the backfill.

---

## Three orthogonal role systems

1. **Climber / setter / admin / owner** on `gym_memberships.role`.
   Legacy. Largely cosmetic now — the role value is still read in
   a few UI affordances but is not load-bearing for access control
2. **Admin / owner** on `gym_admins.role`. The *real* admin layer
   — admin dashboard access, set / route CRUD, invites
3. **Organiser** on `competitions.organiser_id`. Orthogonal to gyms
   — one user organises a comp across many gyms and only admins
   the gyms they're actually admin of

**Never conflate them.** A user can be a climber with no admin
rights, an admin of one gym, and an organiser of a comp spanning
three gyms (only two of which they admin) — all simultaneously.

---

## The crew feature

A crew is a mutual, named group of climbers. Invitations are
bilateral: both sides must agree. Replaced the old follow /
followers system entirely.

Tables (see `docs/schema.md` for columns):

- `crews` — id, name, created_by
- `crew_members` — `(crew_id, user_id, invited_by, status in
  ('pending','active'))`. Unique on `(crew_id, user_id)`
- `blocked_users` — `(blocker_id, blocked_id)`. Powers the filter
  on user search

Trigger `seat_crew_creator` inserts the creator as `active` in the
same transaction as the crew insert, so the creator is never
momentarily outside their own crew.

### Surfaces

- `/crew` — picker. Avatar-stack cards for every crew the caller is
  in, pending invites pinned to the top, zero-crew hero with the
  primary Create CTA. No activity / leaderboard at this level.
- `/crew/[id]` — detail. Header with name + member avatar stack,
  SegmentedControl tabs for **Activity** · **Leaderboard** ·
  **Members**. Each tab loads independently; the shared components
  (CrewActivityFeed, CrewLeaderboardPanel, CrewMembersList) live in
  `src/components/Crew/`.

### Invite lifecycle

```
            inviteToCrew() ────► row inserted status='pending'
                  │
                  ├── notifyUser(kind=crew_invite_received)
                  └── sendPushToUsers(..., category=invite_received)
                              │
              ┌───────────────┴───────────────┐
              │                               │
      acceptCrewInvite()             declineCrewInvite()
      UPDATE status='active'          DELETE row
              │
              ├── notifyUser(kind=crew_invite_accepted)  → inviter
              └── sendPushToUsers(..., category=invite_accepted) → inviter
```

Leaving: `leaveCrew()` has three branches:
- Non-creator → plain delete of own row.
- Creator alone → crew is deleted; FK cascades take care of pending
  invites + member rows.
- Creator with other members → refused. They must transfer ownership
  first (`transferCrewOwnership(crewId, newOwnerId)` — creator-only,
  target must be an active member) which also fires a `notifyUser
  (kind=crew_ownership_transferred)` + category-gated push.

### Rate limit

`bump_invite_rate_limit()` is an atomic SECURITY DEFINER function.
Returns true and increments `invites_sent_today` if under the cap
(10/day). Returns false when the cap is hit. Resets automatically
when `invites_sent_date != current_date`. Stops any one account
from spamming search results.

### Privacy surfaces

- `allow_crew_invites` (boolean on profiles) — when false, hides
  the user from search and blocks incoming invites server-side
- `blocked_users` — bidirectional block check in search and invite
- `relativeDay()` — no clock time ever on the activity feed

---

## Dashboard / analytics pattern

Every aggregate is a Postgres RPC, not a JS reduce:

- `get_set_overview`, `get_top_routes`, `get_active_climber_count`,
  `get_engagement_trend`, `get_flash_leaderboard_set`,
  `get_zone_send_ratio`, `get_community_grade_distribution`,
  `get_setter_breakdown`, `get_all_time_overview`
- Cross-gym: `get_competition_leaderboard`,
  `get_competition_venue_stats`
- Crew: `get_crew_leaderboard`, `get_crew_activity_feed(...)` (two
  signatures — cross-crew and per-crew, see migration 029),
  `get_crew_member_previews`, `get_crew_member_counts`

All have `SECURITY DEFINER` with the appropriate is-member /
is-admin / is-organiser gate inside. Calling them without permission
returns an empty set, not an error.

### Materialised `user_set_stats`

Migration 013 added `user_set_stats(user_id, set_id, gym_id, sends,
flashes, zones, points)`. Trigger on `route_logs` recomputes the
affected `(user, set)` pair on every completed/attempted/zone write.
Every leaderboard RPC reads from this table — never aggregates raw
`route_logs` rows.

---

## Push notifications

Web Push via `web-push` + VAPID.

- **Subscribe** (`src/lib/push/client.ts`): user-gesture-only
  `subscribeDevice()` calls `PushManager.subscribe` + posts the
  serialised subscription to `savePushSubscription` server action
- **Store** (`push_subscriptions` table, migration 014): RLS
  restricts reads/writes to `user_id = auth.uid()`
- **Dispatch** (`src/lib/push/server.ts`): `sendPushToUsers(ids,
  payload)` uses the service client to read every subscription for
  the target users, sends via `web-push`, garbage-collects dead
  endpoints (HTTP 404/410) from the DB as it goes
- **Service worker** (`public/sw.js`): `push` listener renders the
  notification; `notificationclick` focuses or opens the target URL

Dispatch is **best-effort**. `sendPushToUsers` swallows errors,
returns `{ skipped: true }` when VAPID isn't configured. Callers
don't need try/catch — but do wrap the call to `sendPushToUsers`
in a try/catch in server actions so a push failure can never
unwind the user-visible mutation.

### Dispatch triggers

- **Set goes live**: `updateSet` in `src/app/admin/actions.ts`
  detects `draft → live` and notifies `getGymClimberUserIds(gym_id)`
  — everyone with activity at that gym
- **Crew invite received**: `inviteToCrew` — push to recipient
  (`category=invite_received`)
- **Crew invite accepted**: `acceptCrewInvite` — push to the
  original inviter (`category=invite_accepted`)
- **Crew ownership transferred**: `transferCrewOwnership` — push
  to the new creator (`category=ownership_changed`)

### Per-category opt-out

Three boolean columns on `profiles` (migration 032) —
`push_invite_received`, `push_invite_accepted`,
`push_ownership_changed`. `sendPushToUsers(..., { category })`
filters recipients by the matching column before dispatching;
`null`/undefined bypasses (internal/admin calls).

### Persistent in-app log

Every category-tagged push is mirrored as a row in `notifications`
via `notifyUser()` (migration 033). Push is transient; the log
survives OS drops, un-subscribed devices, and missed focus. The
profile header's bell surfaces unread rows and opens the
NotificationsSheet — which marks all unread as read server-side.

`notifyUser()` uses the service-role client internally (migration
040 revoked `authenticated` execute on the `notify_user` RPC —
previously any signed-in user could call it with an arbitrary
target uid + payload, a spoofing surface). The helper takes
`(userId, args)` — no supabase parameter.

### Service worker push-handler guard

`public/sw.js` validates the `url` field on every incoming push
before handing it to `client.navigate` / `openWindow`:
leading-single-slash same-origin paths only, no `//host/…` or
backslash tricks. Belt-and-braces against a future bug (or abuse
of the push channel) that might ship a user-controlled URL.

Pushes also carry a `tag` so a burst of related notifications
coalesces in the tray instead of stacking. Server can override
per-push; default tag groups all Chork notifications.

---

## Offline mutation queue

Located in `src/lib/offline/`. Queues climb-log mutations in
IndexedDB when the browser is offline; flushes on reconnect. Key
invariant: every replayed mutation must be idempotent at the DB
layer. `upsertRouteLog` uses `onConflict: "user_id,route_id"` to
satisfy this. See `docs/db-audit.md` § F.

---

## Page / route inventory

Root group:

- `/` — wall (logged in) / landing (logged out)
- `/login`, `/onboarding`, `/auth/callback`, `/privacy`
- `/leaderboard` — Chorkboard (tapping a climber opens a peek sheet
  with send grid + "View full profile" button)
- `/u/[username]` — climber profile. Own profile surfaces the
  notifications bell + settings gear on the header; other climbers
  show only identity + context line
- `/profile` — redirects to `/u/<own-username>`
- `/crew` — picker (avatar-stack cards for your crews + pending
  invites)
- `/crew/[id]` — detail (tabs for Activity · Leaderboard · Members)
- `/competitions/[id]` — climber-facing comp view

Admin group (`/admin/*`): gated by a signed-in check in the layout;
each page enforces its specific role (gym admin or organiser) and
RLS is the second layer.

- `/admin` — dashboard (gym admin)
- `/admin/signup` — new-gym onboarding
- `/admin/sets`, `/admin/sets/new`, `/admin/sets/[id]`,
  `/admin/sets/[id]/routes`
- `/admin/competitions`, `/admin/competitions/new`,
  `/admin/competitions/[id]`
- `/admin/invite/[token]` — accept an admin invite

---

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

All `cachedQuery` wraps use tags from the `Tag` union in
`src/lib/cache/cached.ts`. Every mutation revalidates tags, not paths.

| Tag | Busted by | Cached helper(s) |
|-----|-----------|------------------|
| `gym:{id}` | gym row edits, is_listed toggles | `getGym` |
| `gym:{id}:active-set` | set goes live / ends / is created | `getCurrentSet`, `getAllSets` |
| `set:{id}:routes` | route add / edit / delete within the set | `getRoutesBySet` |
| `set:route-{id}:routes` | per-route grade vote changes | `getRouteGrade` |
| `set:{id}:leaderboard` | any route_log change affecting rank | (no cached helper yet) |
| `user:{id}:profile` | profile row edits (uid known)  | (no cached helper — bust target only) |
| `user:username-{u}:profile` | profile row edits (username known) | `getProfileByUsername` |
| `user:{id}:stats` | route_log change → user_set_stats trigger | (no cached helper yet) |
| `user:{id}:crews` | crew_members status changed | (no cached helper yet) |
| `user:{id}:notifications` | notifications inserted / marked read | (no cached helper yet) |
| `crew:{id}` | crew row / member set edits | (no cached helper yet) |
| `gyms:listed` | any gym's is_listed flag changed | `getListedGyms` |
| `competition:{id}` | competition row or relations changed | `getCompetitionById` |

### Tags without cache targets

Several tags above (`set:{id}:leaderboard`, `user:{id}:stats`,
`user:{id}:crews`, `user:{id}:notifications`, `crew:{id}`) are busted
by mutations but no helper currently uses them as cache tags. They're
in place for a future revisit:

- **leaderboard / gym-stats** — cannot be wrapped today because the
  RPC's `is_gym_member()` gate uses `auth.uid()`, which returns null
  under the service-role client used inside `unstable_cache` bodies.
  Fix would be new RPC variants taking an explicit caller_id +
  page-level membership check.
- **crews / notifications / stats** — none have a `cachedQuery` wrap
  yet. Mutations bust the tag pre-emptively so adding the cache wrap
  later doesn't require rewriting every mutation site.

This is intentional defensive work. Untagged busts cost nothing
(`revalidateTag` is a no-op when no entry carries the tag), but
would matter the moment the corresponding helper gets cached.

### `user:{id}:profile` vs `user:username-{u}:profile`

`getProfileByUsername` is keyed by the only input it has at wrap
time — the username. The tag mirrors that. Mutations that know only
the userId (most of them) need to look up the current username before
busting; helper `revalidateUserProfile(supabase, userId)` in
`src/lib/cache/revalidate.ts` does this. The `user:{id}:profile` tag
is also busted as a forward-compatibility hook for future caches
keyed by uid (e.g. a `getProfileById` server cache).

`updateProfile` itself doesn't use the helper because it already has
both old + new username in scope from its rename-aware logic.

### Factory-per-call pattern (Layer 2)

`unstable_cache` stringifies every argument when keying, so a
Supabase client can't be passed in — it's not serialisable. Pattern:

```ts
export function getGym(gymId: string): Promise<Gym | null> {
  const fn = cachedQuery(
    ["gym", gymId],
    async (id: string) => {
      const supabase = createCachedContextClient(); // service role
      // ...
    },
    { tags: [`gym:${gymId}`], revalidate: 3600 },
  );
  return fn(gymId);
}
```

Key insight: the cached body uses a service-role client (bypasses RLS)
because cache entries are shared across users. **Authorisation
happens at the page level** before the cached call —
`requireAuth` / `requireGymAdmin` in the page / layout.

When a cached helper needs server-only imports (e.g.
`createCachedContextClient`), keep it out of modules that are also
imported by `"use client"` components. Example: `getCompetitionById`
lives in `src/lib/data/competition-by-id.ts` (server-only) rather
than `competition-queries.ts`, because the latter is imported by
`CompetitionLeaderboard.tsx` (a client component) for its types +
`getCompetitionLeaderboard` helper.

### Page-level gate + service-role cached RPC pattern

**`auth.uid()`-gated RPCs cannot be called directly from inside a
cached body** — `auth.uid()` returns null under the service-role
client, the gate evaluates false, the RPC returns empty, and the
cache fills with empties.

The leaderboard hot path solves this with **paired RPC variants**
(see migration 039):

  - `get_leaderboard_set` / `_all_time` / `get_gym_stats_v2`:
    gated, granted to `authenticated`, called by the per-request
    Supabase client. Used by anything outside the cache layer.
  - `get_leaderboard_set_cached` / `_all_time_cached` /
    `get_gym_stats_v2_cached`: gate dropped, granted to
    `service_role` only (revoked from authenticated, anon, public).
    Called inside `unstable_cache` bodies via
    `createCachedContextClient`.

The membership check shifts to **page level**, before the cached
call. For `/leaderboard` it's implicit — `requireAuth()` already
enforces `gymId === profile.active_gym_id`, so the user is by
definition a member of the gym they're viewing. Cached helpers
trust this contract: a service-role caller wouldn't reach the cached
RPC without the page-level gate firing first.

Cross-ownership (set must belong to gym) stays inside each cached
RPC as belt-and-braces: a forged cache key with mismatched ids
returns nothing rather than leaking another gym's data.

Per-user RPCs (`get_leaderboard_user_row`,
`get_leaderboard_neighbourhood`) **stay uncached** — their output
varies by caller identity, so a shared cache entry isn't possible.

`get_profile_summary` also stays uncached at Layer 2 (only React
`cache()` for per-render dedupe). It's user-scoped — a per-user
cache key would defeat sharing.

### When to cache and when not to

Cache with `unstable_cache` (Layer 2) when:
- Data is shared across users (gym metadata, routes, competitions)
- Read rate » write rate
- Staleness up to the TTL is acceptable

Cache with React `cache()` (Layer 3) when:
- A single render has multiple callers fetching the same thing
- The data varies per-user (auth, session state)

Don't cache when:
- The data varies per-request in a way no tag can express
- Writes happen more often than reads
- The helper needs the caller's auth context (see previous section)

### Mutations → revalidateTag

When touching a mutation: list every tag the DB change can affect, and
call `revalidateTag(tag)` for each. Prefer over-busting to under-busting
if in doubt — a spurious cache miss is cheap, a missed bust is stale UI.

**Never use `revalidatePath("/", "layout")`.** The whole codebase has
zero call sites of that pattern; the lone earlier holdout (onboarding)
now uses `revalidateUserProfile` + `revalidateTag(gym:{id}:active-set)`.
Acceptance check: `grep -rn 'revalidatePath.*"/".*"layout"' src/app`
returns no real call sites.

For mutations that change the profile row but only know the user's
uid (most of them), use `revalidateUserProfile(supabase, userId)` from
`src/lib/cache/revalidate.ts` — it does the username lookup and busts
both `user:{uid}:profile` and `user:username-{u}:profile`. Without
that helper, the by-username cache stays warm for up to 300s after
mutations like `switchActiveGym` / `updateThemePreference`.

### Error sanitisation

Server actions surface errors via `formatError(err)` from
`src/lib/errors.ts`. Postgres `code`s map to friendly user-facing
strings (e.g. `23505` → "That already exists.") so no constraint
name / column value / row fragment leaks to a toast. Unknown codes
return `err.message` only in production; development keeps
`details` + `hint` for debugging.

For server-side logs — full context required — use
`formatErrorForLog(err)` instead. Never pass that string back to the
client.

---

## Bundle hygiene

A few infrastructural calls keep the client bundle small without
contributors having to think about it per-file:

- **`experimental.optimizePackageImports`** in `next.config.ts`
  registers `react-icons/fa6` so its barrel re-exports tree-shake.
  About 55 client files import from this package; without the hint,
  Next would pull the whole barrel module's runtime overhead even
  for one icon. Add new heavy barrels here as needed.
- **`images.remotePatterns`** allows Next's image optimiser to handle
  uploaded JPEGs from Supabase Storage. New CDN hosts must be added
  here before passing them to `<Image>`.
- **`UserAvatar`** routes uploaded JPEGs through the optimiser so
  the CDN serves a width-appropriate variant. The no-image branch
  renders an outlined glyph on the active theme's accent surface
  (no third-party fallback service).
- **`ClimberSheet`** + `RouteLogSheet` are dynamically imported via
  `next/dynamic({ ssr: false })` — they pull `PunchTile` /
  `formatGrade` / sanitisers that we don't want in the cold leaderboard
  paint.
- **Avatar URLs use a content-hash buster** (`?v={sha1[:8]}`), not
  `Date.now()` — re-uploading the same image gives the same URL so
  browser + CDN caches don't churn.

## Validation

`src/lib/validation.ts` is the single source of truth for shared
validators:

- `UUID_RE` + `isUuid()` — RFC-4122 UUID matcher used by every server
  action that takes an id from a form payload (gates the value before
  it touches Postgres / RLS).
- `USERNAME_RE` + `validateUsername()` — lowercase alphanumeric +
  underscore, 3–24 chars.

Server actions: validate at the boundary. Don't inline a fresh
regex literal — keep the union of accepted shapes in one file so a
future loosening (e.g. ULIDs) is one edit.

## Storybook

Every reusable component has `ComponentName.stories.tsx` next to it.
Mock fixtures live in `src/test/mocks.ts`. Story arg fixtures and
vitest test fixtures share the same schema — if you add a column in
a migration, both need updating. Typecheck enforces this at build
time so drift is caught automatically.
