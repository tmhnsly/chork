# Chork

Social platform for logging bouldering competition routes at a single gym.

See @docs/schema.md for the PocketBase schema.

## Commands

- `pnpm dev` — typegen + dev server
- `pnpm typegen` — regenerate PocketBase types (needs `PB_TYPEGEN_EMAIL` / `PB_TYPEGEN_PASSWORD` in `.env.local`)
- `pnpm build` — production build
- `pnpm storybook` — port 6006

## Stack

- Next.js 15 App Router, Turbopack
- PocketBase at `https://chork.pockethost.io/`
- SCSS modules + design token system (`src/styles/`)
- `pocketbase-typegen` → `src/lib/pocketbase-types.ts`
- `react-icons/fa6` for all icons
- `react-hot-toast` via `showToast()` for notifications

## Visual style

Dark-mode-first. Neon lime accent on near-black. Sporty, high-contrast.

- Both dark and light themes must work — never override OS preference
- Accent: Radix `lime` scale. Text on accent uses `--accent-on-solid`
- Surfaces: `@include surface.card` for panels, `@include surface.chrome` for sticky chrome
- Flash badge: amber (`--flash-*` tokens) — never lime
- No glassmorphism. No rounded corners — all radius tokens are 0, except `--radius-full` for avatars
- Radix palette: slate (mono), lime (accent), red (error), teal (success), amber (flash)

## Code rules

- SCSS modules only — no inline styles, no CSS-in-JS
- Container queries for components (`@use 'mixins/container-queries' as cq`), media queries for page layout only
- Typography via `@include type.typography(preset)` — never set font properties manually
- Spacing and color via design tokens (`--space-*`, `--mono-*`, `--accent-*`) — no raw values
- 44×44px minimum tap targets, 8px spacing between them (Apple HIG)
- No `any` — strict TypeScript throughout
- Server components by default; client components only when interactivity requires it
- All data access through `src/lib/data/` helpers — never call PocketBase SDK directly from components
- Usernames always displayed with `@` prefix

## Domain rules — IMPORTANT

- **Points are never stored.** Derive using `computePoints(log)` in `src/lib/data/logs.ts`.
  Formula: flash=4, 2 attempts=3, 3 attempts=2, 4+ attempts=1, incomplete=0. Then +1 if `log.zone === true`.
  Zone is independent of completion — a user can earn the zone bonus without sending the route.
- **Flash is derived, not stored.** `attempts === 1 && completed === true`. Never stored as a field.
- **Attempt counts are private.** Never show raw attempt counts to other users. Points are public.
- **Community grade is an average.** Mean of all `grade_vote` values from completed logs, rounded to nearest integer.
- **One active set at a time.** Home punch card always points to `active = true` set.
- **Archived sets are read-only.** No new `route_logs` or `comments` when `active = false`. Enforce in UI.
- **Beta spray is blurred, not locked.** Uncompleted users see comments blurred with a "Reveal" toggle. Posting beta requires completion. Replying is always allowed.
- **Comments are threaded.** Fetch all comments for a route in one query, build the tree client-side by nesting on `parent_id`. Cap visual depth at 3 levels in the UI. `buildCommentTree()` lives in `src/lib/data/comments.ts`.

## Storybook

- Stories live next to components: `ComponentName.stories.tsx`
- All `src/components/ui/` and key app components need stories
- Autodocs enabled globally; dark/light toggle in toolbar
- Global styles via `.storybook/storybook.scss` (full relative paths)
