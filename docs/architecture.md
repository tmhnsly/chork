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

## Storybook

Every reusable component has `ComponentName.stories.tsx` next to it.
Mock fixtures live in `src/test/mocks.ts`. Story arg fixtures and
vitest test fixtures share the same schema — if you add a column in
a migration, both need updating. Typecheck enforces this at build
time so drift is caught automatically.
