# Chork

Multi-gym bouldering competition tracker PWA. Climbers log attempts on
numbered routes within a gym's active set, earn points on a public
gym-wide leaderboard ("Chorkboard"), and can compete inside private
climb alongside the friends they add.

> Deep dives:
> - `docs/architecture.md` — data access, auth, push, friends model
> - `docs/schema.md` — Supabase tables, RPCs, RLS patterns
> - `docs/migrations.md` — one-line-per-migration catalogue
> - `docs/testing.md` — test patterns + stability invariants
> - `docs/db-audit.md` — findings from the last hardening pass
> - `docs/roadmap.md` — shipped / next / planned

---

## Commands

- `pnpm dev` — dev server
- `pnpm build` — production build (CI equivalent)
- `pnpm test --run` — vitest, should stay green on every commit
- `pnpm lint` (`eslint .`) — CI-blocking. `react-hooks/purity` +
  `react-hooks/set-state-in-effect` are both active; treat as errors
- `pnpm typecheck` — app code. **`pnpm typecheck:test`** — the test
  suite + `src/test/**`, which the base tsconfig excludes so
  `next build` skips them. Vitest transpiles without typechecking, so
  without this a drifted fixture or harness signature never surfaces.
  `pnpm check` runs both plus lint + tests
- `pnpm storybook` — port 6006
- `npx supabase db push` — apply pending migrations to the linked project
- `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts`
  — regenerate types after every migration

## Stack

- Next.js 15 App Router, Turbopack, Server Components default
- Supabase (Auth, Postgres, RLS, RPC functions, `pg_cron`)
- SCSS modules + design-token system (`src/styles/`)
- `react-icons/fa6` for every icon
- `react-hot-toast` via `showToast()` for notifications
- `web-push` (server) + service-worker push listener for PWA pushes

## Environment variables

See `.env.example` for the full list. Required:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS
- `NEXT_PUBLIC_SITE_URL` — public URL, used in invite links / push URLs

Optional (push gracefully no-ops when unset):

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`

---

## Architecture at a glance (details in `docs/architecture.md`)

### Multi-tenancy

Every gym-scoped row carries a `gym_id`. RLS enforces isolation using
`is_gym_member(gym_id)` / `is_gym_admin(gym_id)` SECURITY DEFINER
helpers — app code never filters by gym manually.

**New tables need an explicit Data API grant — RLS is not enough.**
Supabase is dropping the auto-grant for new `public` tables (enforced
on this project from **2026-10-30**; existing tables keep their grants).
The table-level `GRANT` decides whether `anon` / `authenticated` can
reach the table at all via supabase-js / realtime; RLS only filters
*rows* once it's reachable. Every new table read from the client must
`grant … to authenticated` (scoped to its RLS) in the same migration —
see the convention + template in `docs/migrations.md`. Tables touched
only inside SECURITY DEFINER RPCs need no grant.

### Auth

Supabase Auth + `@supabase/ssr`. Middleware caches the onboarded flag
in a `chork-onboarded=<uid>:1` cookie after the first successful
check, so subsequent page navs skip a Supabase round-trip.

Two supabase clients:

- **Browser** (`src/lib/supabase/client.ts`) — anon key, safe in
  `"use client"` components
- **Server** (`src/lib/supabase/server.ts`) — per-request client
  wrapped in React `cache()` so multiple callers in one render share
  one instance. Exports `getServerUser()` / `getServerProfile()` with
  the same semantics for the hot auth calls
- **Service role** (`createServiceClient()`) — bypasses RLS. **Never
  import into `"use client"` files.** The module is guarded with
  `import "server-only"` at the top of `src/lib/supabase/server.ts`

### Auth helpers (`src/lib/auth.ts`)

- `requireSignedIn()` → `{ supabase, userId } | { error }`
- `requireAuth()` → `{ supabase, userId, gymId } | { error }` —
  also enforces `profile.active_gym_id` is set
- `requireGymAdmin(gymId?)` → `{ supabase, userId, gymId, isOwner } |
  { error }` — reads the `gym_admins` table, NOT `gym_memberships.role`
- Mutation gates (uuid validate + auth + rate limit in one call —
  never re-type the prelude): `gateClimberMutation` (gym-scoped),
  `gateGymAdminMutation` (admin), `gateSignedInMutation` (gymless-safe,
  rate limit ON by default — matches use this)
- `requireSameGymScope(supabase, gymId, setId, targetUserId)` — the
  cross-gym exposure gate (set in caller's gym AND target is a
  member). Use it for any read that surfaces another climber's data

### Data access

- Queries: one `*-queries.ts` module per domain surface —
  `route-log-queries` / `route-queries` / `set-queries` /
  `gym-queries` / `profile-queries` / `leaderboard-queries` /
  `friend-queries` / `competition-queries` / `admin-queries` /
  `dashboard-queries` / `match-queries` / `comment-queries` /
  `achievement-queries`. Every read takes `supabase` as first arg.
  (There is no catch-all `queries.ts`; it was split per-surface.)
- Client-reachable data modules use a `*.client.ts` suffix (no
  `server-only` import) — e.g. `gym-queries.client.ts` mirrors the
  server-only `getListedGyms` for `"use client"` callers. Components
  never query Supabase tables directly, even client-side
- Mutations: `src/lib/data/mutations.ts` (climber writes) and
  server-side only; some use service role for
  cross-user writes. Admin + match writes live inline in their server
  action (single-caller wrappers were deliberately inlined — don't
  reintroduce a pass-through mutation module for them)
- Server actions live next to their pages:
  `src/app/(app)/actions.ts`, `src/app/admin/actions.ts`,
  `src/app/friends/actions.ts`
- Types: `src/lib/data/types.ts` derives from `database.types.ts`
  (regenerated after every migration)
- Pure logic (easily testable, no Supabase dependency):
  `src/lib/data/logs.ts` (`computePoints`, `isFlash`,
  `deriveTileState`), `grade-label.ts`, `activity-time.ts`,
  `set-label.ts`, `profile-stats.ts`

### Caching + revalidation

Six concentric layers — see `docs/architecture.md` for the full table.
Quick reference:

- **Layer 2 — server cache** via `cachedQuery()` in
  `src/lib/cache/cached.ts`. Wraps `getGym`, `getCurrentSet`,
  `getAllSets`, `getRoutesBySet`, `getRouteGrade`, `getListedGyms`,
  `getProfileByUsername`, `getCompetitionById` (the last in
  `src/lib/data/competition-by-id.ts` so server-only doesn't leak to
  client bundles). Service-role client inside the cached body —
  authorisation happens at the page level **before** the call.
  `getLeaderboardCached` / `getGymStatsV2Cached` use the paired
  `*_cached` RPC variants from migration 039 (gate dropped, granted
  to service_role only) so leaderboard top-N + gym stats are now
  shared across every viewer. Per-user RPCs (userRow, neighbourhood)
  stay uncached
- **Layer 3 — per-render dedupe** via React `cache()` on
  `getServerUser` / `getServerProfile` / `getProfileSummary` etc.
- **Mutations** revalidate **tags**, not paths.
  `revalidatePath("/", "layout")` is forbidden everywhere except
  inside `revalidateUserProfile` indirection (which still uses tags).
  Tag union lives in `src/lib/cache/cached.ts`; mutation→tag table
  in `docs/architecture.md`. **Reader-first rule:** a tag exists only
  alongside a live `cachedQuery` reader — never bust pre-emptively
  (`src/lib/cache/tags.test.ts` enforces this)
- **`revalidateUserProfile(supabase, userId)`** in
  `src/lib/cache/revalidate.ts` looks up username + busts
  `user:username-{u}:profile` so callers that only know uid don't
  leave the by-username cache stale
- `next.config.ts`: `experimental.staleTimes.dynamic = 60` (60s
  client RSC cache; lowered from 300 once tag busts replaced layout
  scorch)
- `SendsGrid` keeps a `routeDataCache` Map for instant tile re-opens
- `completeRoute` evaluates badges **inline** (~150–250ms) so newly
  earned achievements ride back in the same response and the toast
  fires with the send that earned it. `endMatchAction` is the one that
  defers via `after()` — it has no toast to feed
- `AuthProvider` reads a localStorage profile cache on mount (1h TTL,
  key `chork-profile-cache-v2`). NavBar paints in its full state on
  the first hydration cycle when warm — no brand-only-then-personalised
  flash. Background validates with Supabase + updates if changed

### Performance invariants (learned the hard way)

- **Never call `new Date()` / `Date.now()` in a render body** —
  Next 15's `react-hooks/purity` rule breaks the build. Use a lazy
  `useState` initialiser or compute server-side
- **Never `setState(null)` synchronously inside `useEffect`** —
  `react-hooks/set-state-in-effect` flags it. Use the keyed-cache
  pattern: `{ key, data }` tagged with inputs, derive
  `loading = cache?.key !== key`. Canonical example:
  `src/components/SendsGrid/SendsGrid.tsx` — overlay state keyed on
  `set.id` is reset render-time when the active set flips, no effect
  needed
- **Batch multi-row lookups** — `.in(ids)` pattern, not
  `Promise.all(ids.map(...))` N+1 fan-outs against the same table
- **Middleware runs on every page nav** — avoid adding Supabase
  queries there; prefer cookies for repeat checks
- **Validate ids at the action boundary** with `UUID_RE` /
  `isUuid()` from `src/lib/validation.ts` (single source of truth —
  do NOT inline a fresh regex literal). Same file holds
  `validateUsername`. Server actions reject malformed ids before any
  DB call so RLS isn't the only gate
- **`react-icons/fa6` is barrel-imported across ~55 client files.**
  `next.config.ts` registers `optimizePackageImports` for it so each
  icon tree-shakes properly — keep using `import { FaFoo } from
  "react-icons/fa6"` rather than per-icon subpaths
- **Image optimisation** is on by default for uploaded JPEGs (Next
  resizes via the CDN). `next.config.ts` `images.remotePatterns`
  accepts `*.supabase.co/storage/v1/object/public/**` — add new
  hostnames there before passing them to `<Image>`. The no-image
  branch of `UserAvatar` renders an outlined glyph on the active
  theme's accent surface — no third-party fallback service

---

## Visual style

Dark-mode-first. Neon lime accent on near-black. Sporty, high-contrast.

- Both light + dark must work — never override OS preference
- **Two orthogonal theme systems, don't conflate them.** Light/dark is
  a `class` on `<html>` written by `next-themes`
  (`<ThemeProvider attribute="class">` in `providers.tsx`); the
  `.dark` selector it targets lives inside Radix's `*-dark.css`, not
  in `src/styles`. Palette is `data-theme` via our own store. Changing
  that one prop makes the app light-only with no build error —
  `design-system.test.ts` pins both halves
- **Four user-selectable palettes** (Chork / Blue / Violet / Pink).
  Each is a `[data-theme="…"]` block in
  `src/styles/theme/colors.scss` that re-maps `--mono-*` and
  `--accent-*` to a different Radix scale via mixins. The **accent**
  is what distinguishes a palette; the gray follows from Radix's
  pairing guide for that hue. Flash and zone are brand-fixed across
  every palette
- **A new palette's accent must not collide with a reserved hue** —
  amber (flash + podium gold), teal (zone), red (error), orange
  (warning), bronze (podium 3rd), or the grays (silver + every
  surface). That is why there are four and not more; the reasoning
  is written out above the theme table in `colors.scss`. The
  constraint is real, not stylistic: a send tile, a flash, a zone and
  an untouched route all appear in one grid on the wall
- Theme selection persists on `profiles.theme` (migration 028);
  `theme.tsx` bridges the auth profile into a tiny external store
  via `useSyncExternalStore`. Visiting another climber's profile
  scopes their `data-theme` to `<main>` so the route renders in
  their palette without affecting nav chrome
- Accent: Radix `lime` on the default palette. Text on accent uses
  `--accent-on-solid`
- Surfaces: `@include surface.card` (panels), `surface.chrome`
  (sticky chrome), `surface.glass($opacity)` (sheets, modals)
- Flash badge: **amber** (`--flash-*`), never lime
- Squircle via `--radius-1..4`. PunchTile stays square
- Golden radius for nested containers: inner = outer − gap. Pre-built
  tokens in `radius.scss`: `--radius-inner-{outer}-{gap}`. Never
  guess a step
- Glass: `saturate(180%) blur(20px)`. 30% / 50% / 70% opacity tiers
  (thin / regular / thick)
- Radix palette: olive (mono), lime (accent), red (error), teal
  (success / zone), amber (flash)

### Radix scale discipline (strictly enforced)

- Steps 1-2: page / section backgrounds (`--*-app-bg`, `--*-subtle-bg`)
- Steps 3-5: UI element backgrounds
- Steps 6-8: borders
- Step 9: solid fills — buttons, badges, chart bars, tile states
- Step 10: solid fill hover
- Step 11: low-contrast text / secondary icons
- Step 12: high-contrast text / primary icons
- **Never use step 9 as a text colour** (except `--mono-solid` for disabled)
- **Never dim text via opacity** — use the correct step
- **No `color-mix()`** — use Radix tokens directly

### The tile is the app's vocabulary

Chork already had a good visual language and it was confined to one
screen. The card's route tiles are chunky, square, and coloured by
what you *did* — lime sent, amber flash, olive attempted. Everything
else was full-width grey rectangles of identical weight: a settings
app wearing the same shell.

**A choice is a tile, not a bar.** Anywhere a climber picks between a
small number of things that matter — the game, the discipline, a
grade — use `ChoiceTile` / `ChoiceTiles`, which is the route tile with
a label instead of a number. `SegmentedControl` stays for *filters*
(This set / All time): switching what you're looking at is not the
same act as choosing what you're going to do, and they shouldn't look
alike.

**Selected means accent, always.** Step 9 fill plus `--accent-on-solid`
— the same treatment a sent route gets. The accent is never
decoration; it means "you did this" or "this is yours".

**A range lights up contiguously.** `GradeRangeTiles` fills every
tile between the two bounds rather than marking only the ends, so the
range reads as a range at a glance.

Marketing surfaces are exempt; they have their own job.

### Tile state palette

Completed = accent (lime) · Flash = flash (amber) · Attempted = mono
(olive) · Zone / points = success (teal)

### Type: role × step (Radix Themes model)

Two independent axes, never fused:

- **role** — family, weight, italic, uppercase. The preset name
- **step** — `xs`…`5xl`. Carries size **+ line-height + letter-spacing**
  as one unit, per Radix's scale (tracking tightens as size grows:
  `+0.0025em` at 12px → `-0.02em` at 48px)

```scss
@include type.typography(number);            // preset default step
@include type.typography(number, $step: lg); // same role, 18px
```

Passing `$step` moves all three metrics together — that is why it's
safe to expose when a bare `font-size` override is not. A caller must
never set `font-size` / `line-height` / `letter-spacing` /
`font-weight` / `font-family`. Need something the presets don't
cover? Add a preset to `mixins/_typography.scss`.

- **Uppercase presets add `--tracking-caps` automatically.** Never
  hand-add tracking to caps
- **12px (`--text-xs`) is the floor for text that gets read**,
  matching Radix
- **One rung sits below it: `icon-label` (10px, Apple HIG tab bar).**
  Only for a word captioning a glyph, where a persistent icon carries
  the meaning and the label confirms it. No icon → not available.
  Enforced: the step is absent from `$_steps`, so `$step: icon-label`
  is a compile error; the `icon-label` preset is the only route in
- Preset-level overrides — `leading: ui` (buttons) and
  `tracking: code` (join codes) — live in the preset table only

Every page title uses `@include type.typography(display)` +
`color: var(--mono-text)`. One rule, zero exceptions.

### Transitions

- `--duration-instant` (0.1s) for interactive feedback
- `--duration-fast` (0.2s) for state changes
- `--duration-normal` (0.4s) for position / height / bar growth
- Loops are a separate axis — `--duration-spin`, `--duration-shimmer`.
  Don't borrow a state-change duration for something that never ends
- Navbar uses `transition: none` for instant tab response

### Animation library policy

**No JS animation library.** `motion` / `framer-motion` are not in
package.json and shouldn't be added. The `src/components/motion/`
folder is decorative CSS animations (RevealText, PageHeader,
CollapseFade) — pure clip-path + keyframes that run on the
compositor.

`animation-timeline` and View Transitions API are Chromium-only
today (no Safari, no Firefox baseline). They can layer on as
progressive enhancement via `@supports`, but never as a baseline
animation primitive — Chork's iOS PWA users would see broken or
missing animations otherwise.

For interactive gestures (drag, swipe) we use native pointer events
+ CSS `transition`. If a future feature genuinely needs spring
physics or layout animations, evaluate carefully against this
policy first — the bundle cost of motion libraries is significant
(~30-50KB gz) and our existing CSS is fast and stable.

### Page layout mixins (`src/styles/mixins/_layout.scss`)

- `layout.page` — app pages; `--content-app` (640 tablet / 768 desktop)
- `layout.page-prose` — text; `--content-prose` (672px)
- `layout.page-wide` — admin; `--content-wide` (960px)

All handle min-height, gutters, safe-area insets (top notch + bottom
navbar + home indicator), max-width, and centering.

---

## Code rules

- SCSS modules only — no inline styles, no CSS-in-JS. The one
  allowed use of `style={{...}}` is to **pass a CSS custom property
  through to the SCSS rule** (e.g. `style={{ "--bar-w": pct }}` so
  the `.bar` class can `width: var(--bar-w)`). The SCSS still owns
  every rule; the inline attribute is just a value pipe for the one
  thing that has to be dynamic. Never set `width`, `color`,
  `background`, etc. directly via `style={{...}}`
- Container queries for components, media queries for page layout only.
  **A container must be named** — `container-type` alone can't be
  addressed by the `cq.*` mixins, which all query `@container tile`.
  `SectionCard` is named `tile`, so anything inside a card can use
  `cq.split` / `cq.at()` rather than reaching for the viewport
- Typography via `@include type.typography(role, $step)` — never set
  font properties manually. See "Type: role × step" above
- Spacing + colour via design tokens — no raw values unless captured
  in a shared constants module with a written reason
- **Avatars: `<UserAvatar size="row">`, never a pixel number.** The
  scale is named by role (`stack` / `row` / `rowLg` / `podium` /
  `hero` / `podiumWin`) in `components/ui/avatar-sizes.ts`, mirrored
  to `--size-avatar-*` for skeletons and "+N" pills. `avatar-sizes.test.ts`
  pins the two together — a skeleton that drifts from its real avatar
  is a layout shift on hand-off
- **Disabled state via `state.disabled` / `state.disabled-bare`** —
  never `opacity`. Dimming scales contrast toward the background, so
  an AA-compliant control silently stops being one
- 44×44 minimum tap targets, 8px spacing between them
- No `any` — strict TypeScript throughout
- Server components by default; `"use client"` only when needed
- All data access through `src/lib/data/` helpers — never call
  Supabase directly from components
- Use Postgres RPCs for aggregations — never fetch N rows to sum in JS
- Usernames always displayed with `@` prefix

### Complex client state — use a reducer + hook

- **`useReducer` for genuinely coupled state.** Reach for it when 3+
  pieces of state must mutate together — optimistic update + revert,
  atomic toggles (`toggle-like` flipping `likedIds` AND
  `comments[i].likes` in one step), one-shot hydration of a
  multi-field payload. Independent toggles, orthogonal form fields,
  and isolated flags stay as `useState` — a reducer for those is
  just indirection. Reference shapes:
  `src/components/Match/matchScreenReducer.ts` (realtime merge) and
  `src/components/RouteLogSheet/routeLogReducer.ts` (optimistic +
  revert + paginated list).
- **Custom `useXState` hook for the async handlers around the
  reducer.** When the reducer-owning component grows server-action
  handlers, debounced flushes, optimistic/revert paths, or unmount
  cleanups, extract a `useXState({...}): { state, ...handlers }`
  next to the reducer. The orchestrator component becomes JSX +
  prop bridging. Reference: `useRouteLogState`.
- **Reducer tests are pure unit tests.** Call
  `reducer(state, action)` and assert the return — no render harness,
  no mocks, no fake timers. Pin every transition that has an
  invariant (optimistic-revert paths, idempotent toggle pairs,
  one-shot hydration). References:
  `src/components/Match/matchScreenReducer.test.ts` (25+ cases) and
  `src/components/RouteLogSheet/routeLogReducer.test.ts` (23 cases).
- **Use `useDebouncedFlush` for the debounce-with-flush-on-unmount
  pattern.** Lives at `src/hooks/use-debounced-flush.ts` (pure logic
  in `src/lib/debouncer.ts` with its own unit tests). Never re-roll
  the `timerRef` + `pendingRef` + latest-flush-ref trio inline.
  Adopted by RouteLogSheet (attempts + grade vote) and MatchLogSheet
  (attempts).

---

## Domain rules — IMPORTANT

- **Points are never stored.** Derive via `computePoints(log)` in
  `src/lib/data/logs.ts`. Formula: flash=4, 2=3, 3=2, 4+=1,
  incomplete=0, + 1 if zone. SQL mirrors it via
  `public.compute_points(attempts, completed, zone)` (migration 063)
  — never inline the ladder in TS or SQL; a scoring change is one
  edit in each of those two homes
- **Flash is derived.** `attempts === 1 && completed === true`
- **Attempt counts are private** — never show raw attempts to other
  users. Points and flashes are public. This is **two collapses, not
  one**: aggregate totals are masked to 0 in SQL, per-log values are
  bucketed to `{0,1,2}` by `visibleAttempts()` (tile state needs the
  flash signal). Read CONTEXT.md "Attempt privacy" before touching
  either — the SQL mask has been dropped twice; both grains are now
  pinned by `src/lib/data/attempt-privacy.test.ts`
- **Community grade is an average** via `get_route_grade()` RPC
- **Grading scales per set.** Each set has `grading_scale`
  (`v` / `font` / `points`) and `max_grade`. The climber-side grade
  slider reads both. Points-only sets hide the slider entirely.
  Label mapping lives in `src/lib/data/grade-label.ts`
- **One live set per gym at a time.** App-enforced since 2026-08:
  `createSet` (status live) and `updateSet`'s go-live branch both
  archive the incumbent first, in `src/app/admin/sets-actions.ts` —
  the single set-creation/publish path. Still not a DB constraint;
  the pg_cron auto-publish path relies on migration 071's
  auto-archive of ended sets
- **Archived / draft sets are read-only** for climbers. Migration 003
  blocks inserts against non-live sets at the RLS layer
- **Legacy `sets.active` is derived from `sets.status`** via a
  trigger. New code writes `status`; old readers of `active` still
  work. Prefer `status` in new code
- **Beta spray uses opacity, not blur.** `opacity: 0.4 + filter: blur(3px)`
  with a reveal toggle
- **Activity feed timestamps are coarse.** `relativeDay()` in
  `src/lib/data/activity-time.ts` — "today" / "yesterday" / "N days ago".
  Never clock time, hours, am/pm. Privacy-first so climbers can't
  infer when mates are physically at the gym

### A gym is optional — gymless is a first-class state

Chork's core is that anyone can run their own comp anywhere via a
**match** — at a gym, outdoors, on a home wall. The Wall and Chorkboard
are the *extra* layer for gyms that have adopted Chork, not the
baseline. Never write code that assumes `profile.active_gym_id` is
set.

- `requireSignedIn()` for anything that works without a gym (matches,
  friends, profiles, notifications). `requireAuth()` **only** for
  genuinely gym-scoped surfaces — it fails with "No gym selected"
- Gymless routing already exists: `/` and `/leaderboard` redirect to
  `/match`, NavBar drops to its gymless variant (Crew / Match / Profile),
  and the profile page guards its gym sections. Onboarding can be
  completed without a gym
- **Leaving a gym parks it, never severs it.** `clearActiveGym` nulls
  `active_gym_id` and keeps the `gym_memberships` row, because
  `route_logs` SELECT is gated on `is_gym_member(gym_id)` — dropping
  the membership would make the climber's own history at that gym
  unreadable to them. `switchActiveGym` preserves old memberships for
  the same reason
- A departed climber stays on that gym's **all-time** board (they did
  climb there) and falls off the **current-set** board on its own,
  since set boards only count logs in that set

Known gap: `activity_events` is only written by gym-wall sends and
comments, so a gymless climber produces nothing for a feed.
Decided direction is one event per match, parked pending the moments
feed (docs/roadmap.md), which is what friends at other gyms will see.

### Friends (crews are gone)

**There is no asymmetric relationship in this app.** Follows were
ripped out in migration 020, crews replaced them, and friends
replaced crews in migrations 104–108. Every social link is still one
row both sides agreed to. `follower_count`, `getFollowers`, anything
`crew*` — all stale, all should be deleted on sight.

**Why crews went:** create, name, invite, accept — four steps before
anything was worth looking at, and every crew started empty. A friend
link is worth something at one connection.

**`public.friends`** is one row per pair (`requester_id` /
`addressee_id` only record who asked), unique on the *unordered* pair
via an index on `(least, greatest)`. It has **no Data API grant** —
every read and write goes through a SECURITY DEFINER RPC, so the
table is unreachable from supabase-js and RLS is not the only gate.
The RPC owns the state machine, and the states matter:

- asking twice is idempotent — one row, one notification
- asking someone who already asked *you* accepts
- declining is silent, and the row persists so suggestions stop
  offering them
- the person declined cannot re-ask; the person who declined can
  change their mind

**Discovery, not search.** `get_friend_suggestions` reads Matches you
have shared — never gym Sets, since everyone at your gym shares the
current Set and that would be a directory. Guests are excluded; they
have no account to link to.

**`profiles.allow_friend_requests`** is enforced inside
`request_friend` and hides you from suggestions. A privacy switch the
server doesn't honour is decoration.

**Surfaces:** `/friends` is roster + suggestions + the friends board
(`get_friends_leaderboard`, set-scoped, always includes you). Friends
at other gyms share no Set, so a board is empty for them — they are
the reason the moments feed exists (docs/roadmap.md).

### Notifications

Two layers: push (best-effort, transient) + persistent log
(`notifications` table, migration 033). Every push-worthy event is
tagged with a category (`invite_received` / `invite_accepted`) — `sendPushToUsers(..., { category })` filters
recipients by the opt-in bool on `profiles` (migration 032). The
`notifyUser(userId, args)` helper writes a log row alongside so
missed pushes are caught up in the NotificationsSheet.

`notify_user` RPC is service-role-only (migration 040) — prior to
that, any signed-in user could call it with an arbitrary target
uid. The `notifyUser` helper uses `createServiceClient()`
internally; don't pass a supabase client to it.

The service worker (`public/sw.js`) only opens same-origin paths
on tap — any notification `url` that isn't a single-leading-slash
path falls back to `/`. Pushes carry a per-kind `tag`
(`chork-{kind}`, set in `notify`) so repeats of one kind coalesce in
the tray while different kinds stay separate; `announce()` sends
none, so broadcasts fall back to `chork-notification`.

### Admin vs climber vs organiser

Three distinct roles, never conflate:

- Climber membership: `gym_memberships(user_id, gym_id, role)` —
  role column exists but is largely cosmetic now. **NEVER gate UI on
  `gym_memberships.role`** — use the `gym_admins`-backed helpers
  (`isGymAdminOf`, `requireGymAdmin`) instead. The home page shipped
  the wrong gate once; don't repeat
- Admin rights: `gym_admins(user_id, gym_id, role in ('admin','owner'))`
  — separate table. `is_gym_admin(gym_id)` reads from here.
  `isGymAdminOf(supabase, userId, gymId)` is the cheapest app-side
  check (single indexed lookup)
- Competition organiser: `competitions.organiser_id` —
  `is_competition_organiser(comp_id)` gates organiser-only actions.
  Distinct from gym admin

---

## Testing

Vitest-based. See `docs/testing.md` for patterns. Key rules:

- **Tests exist to catch stability regressions, not to hit a coverage
  number.** Assert invariants, not implementation details
- Privacy contracts get explicit anti-regression tests (e.g.
  `relativeDay` has tests asserting no clock-time output)
- **Design-system rules are enforced by tests, not review.**
  `src/styles/design-system.test.ts` greps the SCSS and TSX for raw
  letter-spacing / line-height / px font-sizes, opacity-dimmed
  disabled states, viewport media queries inside components,
  hardcoded breakpoints, open-coded `color-mix` / `rgba` /
  `cubic-bezier`, hand-rolled focus rings and numeric
  `<UserAvatar size>`. Each failure names the rung to use instead.
  **A rule you can't satisfy means a missing token — add the token
  rather than widening an exemption.** Marketing surfaces
  (`components/landing/`, `app/gyms/`) are exempt from the size and
  rhythm rules only, pending the homepage refresh.
  `avatar-sizes.test.ts` separately pins the TS avatar map to its CSS
  tokens
- Server actions get tests for: input validation, auth failure, each
  distinct user-visible error path, friendly-error mapping
- Fixtures must be realistic — Postgres errors need a `code` field,
  not just `message`. `formatError` maps known codes (23505 / 23503 /
  23514 / 23502 / 42501 / PGRST116 / PGRST301) to friendly user-facing
  strings; unknown codes return the raw `message` only in production
  (no `details` / `hint` leak). `formatErrorForLog` keeps full context
  for server logs

---

## Storybook

- Stories live next to components: `ComponentName.stories.tsx`
- Mock factories in `src/test/mocks.ts`
- Autodocs enabled globally; dark / light toggle in toolbar
- Mock factories include every current column — update them when a
  migration adds fields or typecheck breaks the build
