# Chork

Multi-gym bouldering competition tracker PWA. Climbers log attempts on
numbered routes within a gym's active set, earn points on a public
gym-wide leaderboard ("Chorkboard"), and can compete inside private
groups called **crews**.

> Deep dives:
> - `docs/architecture.md` — data access, auth, push, crew model
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
- `pnpm next lint` — CI-blocking. `react-hooks/purity` +
  `react-hooks/set-state-in-effect` are both active; treat as errors
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

### Data access

- Queries: `src/lib/data/queries.ts`, `.../admin-queries.ts`,
  `.../crew-queries.ts`, `.../dashboard-queries.ts`,
  `.../competition-queries.ts`. Every read takes `supabase` as first arg
- Mutations: `src/lib/data/mutations.ts`, `.../admin-mutations.ts`
  — server-side only; some use service role for cross-user writes
- Server actions live next to their pages:
  `src/app/(app)/actions.ts`, `src/app/admin/actions.ts`,
  `src/app/crew/actions.ts`
- Types: `src/lib/data/types.ts` derives from `database.types.ts`
  (regenerated after every migration)
- Pure logic (easily testable, no Supabase dependency):
  `src/lib/data/logs.ts` (`computePoints`, `isFlash`,
  `deriveTileState`), `grade-label.ts`, `crew-time.ts`,
  `set-label.ts`, `profile-stats.ts`

### Caching + revalidation

- `next.config.ts`: `experimental.staleTimes.dynamic = 300` (5-min
  client RSC cache)
- Mutations call `revalidatePath("/", "layout")` (and `/admin`,
  `/crew` where relevant) to bust immediately
- `SendsGrid` caches route-sheet data in a `routeDataCache` Map so
  re-opening a tile is instant
- `getServerProfile` / `getServerUser` wrapped in `cache()` — root
  layout + page + auth helpers share the same data within one render

### Performance invariants (learned the hard way)

- **Never call `new Date()` / `Date.now()` in a render body** —
  Next 15's `react-hooks/purity` rule breaks the build. Use a lazy
  `useState` initialiser or compute server-side
- **Never `setState(null)` synchronously inside `useEffect`** —
  `react-hooks/set-state-in-effect` flags it. Use the keyed-cache
  pattern: `{ key, data }` tagged with inputs, derive
  `loading = cache?.key !== key`
- **Batch multi-row lookups** — `.in(ids)` pattern, not
  `Promise.all(ids.map(...))` N+1 fan-outs against the same table
- **Middleware runs on every page nav** — avoid adding Supabase
  queries there; prefer cookies for repeat checks

---

## Visual style

Dark-mode-first. Neon lime accent on near-black. Sporty, high-contrast.

- Both light + dark must work — never override OS preference
- **Six user-selectable palettes** (Chork / Slate / Sand / Gray /
  Mauve / Sage). Each is a `[data-theme="…"]` block in
  `src/styles/theme/colors.scss` that re-maps `--mono-*` and
  `--accent-*` to a different Radix scale via mixins. Flash and
  zone are brand-fixed across every palette
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

### Tile state palette

Completed = accent (lime) · Flash = flash (amber) · Attempted = mono
(olive) · Zone / points = success (teal)

### Page titles

Every page title uses `@include type.typography(display)` +
`color: var(--mono-text)`. One rule, zero exceptions.

### Transitions

- 0.1s for interactive feedback
- `--duration-fast` (0.2s) for state changes
- `--duration-normal` (0.4s) for position / height / bar growth
- Navbar uses `transition: none` for instant tab response

### Page layout mixins (`src/styles/mixins/_layout.scss`)

- `layout.page` — app pages; `--content-app` (640 tablet / 768 desktop)
- `layout.page-prose` — text; `--content-prose` (672px)
- `layout.page-wide` — admin; `--content-wide` (960px)

All handle min-height, gutters, safe-area insets (top notch + bottom
navbar + home indicator), max-width, and centering.

---

## Code rules

- SCSS modules only — no inline styles, no CSS-in-JS
- Container queries for components, media queries for page layout only
- Typography via `@include type.typography(preset)` — never set font
  properties manually
- Spacing + colour via design tokens — no raw values unless captured
  in a shared constants module with a written reason
- 44×44 minimum tap targets, 8px spacing between them
- No `any` — strict TypeScript throughout
- Server components by default; `"use client"` only when needed
- All data access through `src/lib/data/` helpers — never call
  Supabase directly from components
- Use Postgres RPCs for aggregations — never fetch N rows to sum in JS
- Usernames always displayed with `@` prefix

---

## Domain rules — IMPORTANT

- **Points are never stored.** Derive via `computePoints(log)` in
  `src/lib/data/logs.ts`. Formula: flash=4, 2=3, 3=2, 4+=1,
  incomplete=0, + 1 if zone
- **Flash is derived.** `attempts === 1 && completed === true`
- **Attempt counts are private** — never show raw attempts to other
  users. Points are public
- **Community grade is an average** via `get_route_grade()` RPC
- **Grading scales per set.** Each set has `grading_scale`
  (`v` / `font` / `points`) and `max_grade`. The climber-side grade
  slider reads both. Points-only sets hide the slider entirely.
  Label mapping lives in `src/lib/data/grade-label.ts`
- **One live set per gym at a time** (convention, not a DB constraint)
- **Archived / draft sets are read-only** for climbers. Migration 003
  blocks inserts against non-live sets at the RLS layer
- **Legacy `sets.active` is derived from `sets.status`** via a
  trigger. New code writes `status`; old readers of `active` still
  work. Prefer `status` in new code
- **Beta spray uses opacity, not blur.** `opacity: 0.4 + filter: blur(3px)`
  with a reveal toggle
- **Activity feed timestamps are coarse.** `relativeDay()` in
  `src/lib/data/crew-time.ts` — "today" / "yesterday" / "N days ago".
  Never clock time, hours, am/pm. Privacy-first so climbers can't
  infer when mates are physically at the gym

### Crews replaced follows

The follow / followers feature was ripped out in migration 020 and
replaced by the crew system (migration 021). There is no asymmetric
relationship in the app — every social link is a mutual `crew_members`
row that both sides agreed to. If you see `follower_count` or
`getFollowers` anywhere, it's a stale reference and should be deleted.

### Admin vs climber vs organiser

Three distinct roles, never conflate:

- Climber membership: `gym_memberships(user_id, gym_id, role)` —
  role column exists but is largely cosmetic now
- Admin rights: `gym_admins(user_id, gym_id, role in ('admin','owner'))`
  — separate table. `is_gym_admin(gym_id)` reads from here
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
- Server actions get tests for: input validation, auth failure, each
  distinct user-visible error path, DB error propagation
- Fixtures must be realistic — Postgres errors need a `code` field,
  not just `message`, or `formatError` falls through to its generic

---

## Storybook

- Stories live next to components: `ComponentName.stories.tsx`
- Mock factories in `src/test/mocks.ts`
- Autodocs enabled globally; dark / light toggle in toolbar
- Mock factories include every current column — update them when a
  migration adds fields or typecheck breaks the build
