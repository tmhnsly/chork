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
        ├── (reads)    src/lib/data/<surface>-queries.ts
        ├── (admin r.) src/lib/data/admin-queries.ts
        ├── (social r.) src/lib/data/friend-queries.ts
        └── (writes)   src/lib/data/mutations.ts, or inline in the
                       owning server action
                                │
                                └── Supabase client (RLS applies)
```

**Rule**: if you reach for a raw Supabase call from a component, you're
doing it wrong — add a helper instead.

**Writes and the deletion test.** A `*-mutations.ts` module earns its
keep only when a write has more than one caller or carries real
orchestration (`mutations.ts` upsert semantics). Single-caller
pass-through wrappers do not: `admin-mutations.ts`
(13 functions, 13 callers, 1:1) and `jam-mutations.ts` (7 RPC
wrappers — the Match feature was called "jams" then) were inlined into
their owning server actions in 2026-08 —
each wrapper's interface was as large as its body, and the layer had
grown a third error contract that leaked raw `error.message` to the
client. Admin + match writes now live inline in their action, next to
the gate, validation, and tag busts they belong with.

### Passing `supabase` as first arg

Every data function takes the Supabase client as its first argument
rather than calling `createServerSupabase()` internally. Two reasons:

1. Tests mock the client at the call site without module-level
   patching
2. Server actions already hold an authed client from `requireAuth` —
   re-creating one would break React's per-render cache

**Exception: cached helpers.** Functions wrapped in `cachedQuery(...)`
(`getGym`, `getCurrentSet`, `getAllSets`, `getLeaderboardCached`,
`getCompetitionById`, etc.) **must not** accept a Supabase client as
an argument. Reasons:

- `unstable_cache` keys on JSON-stringified args; a `SupabaseClient`
  is not serialisable and would either explode the key cardinality
  (every per-request client = a new cache entry) or throw.
- Cached entries are shared across viewers, so the auth context
  inside the cached body has to come from the service-role client,
  not the caller's RLS-scoped one. Mixing per-viewer auth into a
  shared cache is a permission-leak surface.

Cached helpers therefore construct their own Supabase client inside
`cachedQuery` via `createCachedContextClient()` (service-role, no
RLS). The caller authorises at the page level **before** invoking
the cached helper — typically through `requireAuth` /
`requireGymAdmin` — and trusts the gate. See `src/lib/cache/cached.ts`
for the implementation and the per-call-site notes on why each
cached read is safe to share.

### Client vs server separation

- `src/lib/supabase/server.ts` has `import "server-only"` at the
  top — any attempt to import it from a `"use client"` file errors
  at build time
- The `*-queries.ts` modules are marked `"server-only"` where
  needed. Query helpers that need to run in the browser (e.g.
  `getCrewActivityFeed` paging) are called with a browser client;
  a module written *for* the browser takes the `*.client.ts` suffix
  (see `gym-queries.client.ts`)
- If you need the same shape of data in both contexts, inline the
  query in the client component rather than importing a server-only
  helper

### Read vs mutation error contract

Codified at the top of `src/lib/data/read.ts` and
`src/lib/data/mutations.ts`.

**Reads** (`*-queries.ts`) swallow Postgres errors, log to console,
return a neutral fallback (`null` / `[]`). Render paths handle
"absent" the same as "failed", so callers don't need try/catch.
Concentrated in `readSingle` / `readMany` helpers.

**Mutations** follow one of two contracts depending on the kind of
failure the function can produce. Both are valid; pick the one that
matches the failure mode. In both, **every Postgres error that
reaches the client goes through `formatError`** — never raw
`error.message`, which can echo constraint names or row fragments
(info disclosure; see `src/lib/errors.ts`).

#### Throw contract (`mutations.ts`)

Used by climber-side writes (route logs, comments, comment likes,
activity events) where Postgres errors are unexpected — a constraint
or RLS violation reaching this layer means the action's pre-check
missed something, and the right response is to bail to the action's
top-level try/catch.

- Mutation: `if (error) throw error;`
- Caller (server action) wraps the call in `try { ... } catch (err)
  { return { error: formatError(err) } }`.

#### Discriminated-return contract (inline action writes)

Used by writes that produce **known, user-facing business errors** —
duplicate slug, expired invite, rate-limit exceeded, "you're already
a member". The user needs a friendly, specific message; routing
those through `formatError` would lose the specificity that makes
the message actionable.

- Known business error: `return { error: "That gym slug is already
  taken." }`.
- Any other Postgres error: `return { error: formatError(error) }`.

**Pick by failure shape:** if the failure is "user did something
the UI should have prevented and we want a clean message," return
the specific message. If the failure is "something broke that
shouldn't have," format it. Don't mix the two contracts in one
function.

Don't blur the read/write line either: a silent-swallow on a mutation
lets the caller think the write succeeded and skip its post-write
tag busts / push dispatch / activity log.

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

## The friends feature

> **Crews are gone.** Follows were removed in migrations 020–021 and
> replaced by crews; crews were removed in migrations 104–108 and
> replaced by friends. Anything `crew*`, `follower_count` or
> `getFollowers` is dead on sight. The `crews`, `crew_members` and
> `blocked_users` tables no longer exist.
>
> **Why crews went:** create, name, invite, accept — four steps before
> anything was worth looking at, and every crew started empty. A
> friend link is worth something at one connection.

A friend link is one row per pair, unique on the **unordered** pair
via an index on `(least, greatest)`. `requester_id` / `addressee_id`
only record who asked — there is no asymmetric relationship in this
app.

**`public.friends` has no Data API grant.** Every read and write goes
through a SECURITY DEFINER RPC, so the table is unreachable from
supabase-js and RLS is not the only gate.

### The RPC surface

Writes (`src/app/friends/actions.ts`): `request_friend`,
`respond_to_friend`, `remove_friend`, `search_climbers`.
Reads (`src/lib/data/friend-queries.ts`): `friend_status`,
`get_friends`, `get_friend_suggestions`, `get_friends_leaderboard`,
`get_friend_moments`.

### The state machine (migration 106 owns it)

`pending` → asked, awaiting an answer. `active` → friends.
`declined` → refused, and the row **persists** so suggestions stop
offering them.

- Asking twice is idempotent — one row, one notification.
- Asking someone who already asked *you* accepts.
- Declining is silent. The person declined **cannot** re-ask; the
  person who declined can change their mind.

### Notifications

`friend_request_received` → the addressee; `friend_request_accepted`
→ the original requester. Both go through `notifyUser` (log row) plus
a category-gated push. `friends/actions.ts` wraps `notify()` in a
local try/catch, which is belt-and-braces — `notify()` already
swallows both halves internally.

### Discovery, not search

`get_friend_suggestions` reads **Matches you have shared** — never gym
Sets, since everyone at your gym shares the current Set and that would
turn suggestions into a directory. Guests are excluded; they have no
account to link to.

### Surfaces

`/friends` is roster + suggestions + the friends board
(`get_friends_leaderboard`, set-scoped, always includes you) + the
moments feed. Components live in `src/components/Friends/`:
`FriendsList`, `FriendSearch`, `FriendsBoard`, `MomentsFeed`.

Friends at other gyms share no Set, so the board is empty for them —
that is precisely why `MomentsFeed` exists (`get_friend_moments`,
migrations 109–110, one best moment per day).

### Privacy surfaces

- `profiles.allow_friend_requests` — enforced **inside**
  `request_friend` and hides you from suggestions. A privacy switch
  the server doesn't honour is decoration.
- Rate limiting comes from the `gate*` helpers, not a bespoke
  `bump_invite_rate_limit` (that went with crews). Read-only status
  lookups opt out explicitly with `{ rateLimit: null }` so a search
  result doesn't pay for the check.
- `relativeDay()` — no clock time ever on the moments feed.

---

## Dashboard / analytics pattern

Every aggregate is a Postgres RPC, not a JS reduce:

- `get_set_overview`, `get_top_routes`, `get_active_climber_count`,
  `get_engagement_trend`, `get_flash_leaderboard_set`,
  `get_zone_send_ratio`, `get_community_grade_distribution`,
  `get_setter_breakdown`, `get_all_time_overview`
- Cross-gym: `get_competition_leaderboard`,
  `get_competition_venue_stats`
- Social: `get_friends`, `get_friends_leaderboard`,
  `get_friend_suggestions`, `get_friend_moments`, `friend_status`
  (migrations 104–110)

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

- **Set goes live**: `updateSet` in `src/app/admin/sets-actions.ts`
  detects `draft → live` and notifies `getGymClimberUserIds(gym_id)`
  — everyone with activity at that gym
- **Friend request received**: `requestFriend` — push to the
  addressee (`category=invite_received`)
- **Friend request accepted**: `respondToFriend` — push to the
  original requester (`category=invite_accepted`)
- **Match invite received**: push to the invited climber
  (`category=invite_received`)

> The `ownership_changed` category still has a column on `profiles`
> and an entry in `CATEGORY_COLUMN`, but **nothing sends it** — it
> went with crew ownership transfer. Retire it or reuse it; don't
> assume it's live.

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
- `/friends` — roster + suggestions + friends board + moments feed
- `/match`, `/match/new`, `/match/join`, `/match/[id]`,
  `/match/summary/[id]` — the Match tree
- `/r/[token]` — public Match result card (capability token)
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
| `gym:{id}` | gym row edits, is_listed toggles | `getGym`, `getLeaderboardCached`, `getGymStatsV2Cached` |
| `gym:{id}:active-set` | set goes live / ends / is created | `getCurrentSet`, `getAllSets` |
| `set:{id}:routes` | route add / edit / delete within the set | `getRoutesBySet` |
| `route:{id}:grade` | per-route grade vote changes | `getRouteGrade` |
| `route:{id}:comments` | comment post / edit / delete | `getCommentsByRoute` |
| `set:{id}:leaderboard` | any route_log change affecting rank | `getLeaderboardCached`, `getGymStatsV2Cached` |
| `user:username-{u}:profile` | profile row edits | `getProfileByUsername` |
| `gyms:listed` | any gym's is_listed flag changed | `getListedGyms` |
| `competition:{id}` | competition row or relations changed | `getCompetitionById` |

### The reader-first rule (no write-only tags)

Every tag in the table has a live `cachedQuery` reader — enforced by
`src/lib/cache/tags.test.ts`. A tag lands in `tags.ts` in the same
change as the reader that carries it, never ahead of one.

The previous convention ("bust pre-emptively so adding the cache wrap
later doesn't require rewriting every mutation site") was retired in
2026-08 after an audit found six tags (`user:{id}:stats`,
`user:{id}:crews`, `user:{id}:profile`, `crew:{id}`,
`user:{id}:notifications`, `user:{id}:jams`) busted at 13 sites with
no reader anywhere. The claimed zero cost turned out false in two
ways: `revalidateCrewMembers` ran a live `crew_members` SELECT on
every crew mutation purely to fan out no-op busts, and tests had
started pinning the phantom busts as if they prevented stale UI. If a
surface gains a cached reader later, adding its busts then is cheap —
and the hygiene test names every mutation that needs one the moment
the tag exists.

### `user:username-{u}:profile`

`getProfileByUsername` is keyed by the only input it has at wrap
time — the username. The tag mirrors that. Mutations that know only
the userId (most of them) need to look up the current username before
busting; helper `revalidateUserProfile(supabase, userId)` in
`src/lib/cache/revalidate.ts` does this.

`updateProfile` itself doesn't use the helper because it already has
both old + new username in scope from its rename-aware logic.

**Deletion busts too — and a deletion done outside the app can't.**
`deleteAccount` busts the handle's tag before and after the
`auth.admin.deleteUser` call (before: the lookup needs the row; after:
a request in between could re-cache it). A user removed by hand in SQL
gets no bust, and the entry outlives the row: `revalidate: 300` is
stale-while-revalidate, so after the TTL the next visitor is served
the stale row ONCE while it refetches. Seen on 2026-08-19 — a handle
re-registered after a hand-deleted account rendered its new owner's
own profile as a stranger's (old id, old avatar) for exactly one
request. If you delete users by SQL, accept that, or do it through the
app. The same SWR-once applies to any profile edit that bypasses the
mutations (e.g. a SQL fix-up); it is by design for edits, and a
surprise only for deletions.

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

## Hosting regions

`vercel.json` pins functions to **`arn1` (Stockholm)** because the
Supabase project lives in **`eu-north-1` (Stockholm)**. They must stay
together — if the database ever moves, move this with it.

Functions defaulted to `iad1` (US East) while the database was in
Stockholm, so every server-side query crossed the Atlantic at roughly
90-110ms round trip. A page render makes several Supabase calls, and
each uncached one paid that toll, on every request rather than only on
a cold start.

Co-locating with the database rather than with the users is the right
way round here: a visitor makes **one** request to the function, but
the function makes **many** calls to Postgres. Putting it in `lhr1`
(London) would shave ~30ms off the user's single hop and add ~30ms to
each of the N queries behind it. `arn1` drops the query hop to
near-zero and costs UK visitors a few tens of ms once.

Worth re-checking if the audience ever stops being UK/EU-centric, or
if server rendering stops being query-heavy.

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
