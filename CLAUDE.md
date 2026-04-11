# Chork

Multi-gym bouldering competition tracker. Climbers log attempts on competition routes, track progress via a punch card, and compete on leaderboards.

See `docs/schema.md` for the Supabase schema. See `docs/roadmap.md` for the full feature roadmap.

## Commands

- `pnpm dev` — dev server
- `pnpm build` — production build
- `pnpm storybook` — port 6006
- `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts` — regenerate Supabase types

## Stack

- Next.js 15 App Router, Turbopack
- Supabase (Auth, Database, RLS)
- SCSS modules + design token system (`src/styles/`)
- `react-icons/fa6` for all icons
- `react-hot-toast` via `showToast()` for notifications

## Architecture

### Multi-tenancy

Every piece of gym data is scoped to a `gym_id` at the database level. Users belong to multiple gyms via `gym_memberships` with a role (climber, setter, admin, owner). Row Level Security enforces gym isolation — application code never needs to filter by gym manually.

### Auth

Supabase Auth with email+password. Sessions managed by `@supabase/ssr` middleware. Profiles auto-created on signup via a Postgres trigger. Two Supabase clients:

- **Browser client** (`src/lib/supabase/client.ts`): uses anon key, safe for client components
- **Server client** (`src/lib/supabase/server.ts`): wrapped in React `cache()` for deduplication, plus a service role client for admin operations (bypasses RLS)

### Data access

- Server components: `const supabase = await createServerSupabase()`
- Server actions: `const { supabase, userId, profile } = await requireAuth()` (from `src/lib/auth.ts`)
- Queries: `src/lib/data/queries.ts` — all read functions take `supabase` as first param
- Mutations: `src/lib/data/mutations.ts` — all write functions, some use service role for cross-user operations
- Types: `src/lib/data/types.ts` — derived from `src/lib/database.types.ts` (generated)
- Pure functions: `src/lib/data/logs.ts` — `computePoints`, `isFlash`, `computeRouteGrade`

### Caching

- `staleTimes.dynamic: 300` — 5-minute client-side RSC cache
- Mutations call `revalidatePath("/", "layout")` to bust the cache immediately
- Route data cached per-route in PunchCard state for instant re-open

## Visual style

Dark-mode-first. Neon lime accent on near-black. Sporty, high-contrast.

- Both dark and light themes must work — never override OS preference
- Accent: Radix `lime` scale. Text on accent uses `--accent-on-solid`
- Surfaces: `@include surface.card` for panels, `@include surface.chrome` for sticky chrome
- Flash badge: amber (`--flash-*` tokens) — never lime
- Squircle border radius via `--radius-1` through `--radius-4` tokens. PunchTile stays square (no radius)
- Golden ratio for nested radius: inner = outer − padding
- Glassmorphism allowed on floating chrome (navbar, dropdowns) via `backdrop-filter: blur` + `color-mix` transparency
- Radix palette: olive (mono), lime (accent), red (error), teal (success), amber (flash)

## Code rules

- SCSS modules only — no inline styles, no CSS-in-JS
- Container queries for components, media queries for page layout only
- Typography via `@include type.typography(preset)` — never set font properties manually
- Spacing and color via design tokens — no raw values
- 44×44px minimum tap targets, 8px spacing between them
- No `any` — strict TypeScript throughout
- Server components by default; client components only when interactivity requires it
- All data access through `src/lib/data/` helpers — never call Supabase directly from components
- Use Postgres views/RPC functions for aggregations — don't fetch N records to compute in JS
- Usernames always displayed with `@` prefix

## Domain rules — IMPORTANT

- **Points are never stored.** Derive using `computePoints(log)` in `src/lib/data/logs.ts`.
  Formula: flash=4, 2 attempts=3, 3 attempts=2, 4+ attempts=1, incomplete=0. Then +1 if zone.
- **Flash is derived, not stored.** `attempts === 1 && completed === true`.
- **Attempt counts are private.** Never show raw attempt counts to other users. Points are public.
- **Community grade is an average.** Via `get_route_grade()` RPC function.
- **One active set per gym at a time.**
- **Archived sets are read-only.** No new logs or comments when `active = false`. Enforce in UI.
- **Beta spray uses opacity, not blur.** `opacity: 0.4` + `filter: blur(3px)` with reveal toggle.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS

## Storybook

- Stories live next to components: `ComponentName.stories.tsx`
- Mock factories in `src/test/mocks.ts`
- Autodocs enabled globally; dark/light toggle in toolbar
