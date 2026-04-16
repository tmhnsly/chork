# Verification

How to run each test layer locally + what they cover. This file is
the single source of truth for "what's verified, what isn't" —
update it in the same PR as any test-infra change.

```
┌──────────────────────────────────────────────────────────────┐
│  Layer            Where                      Runs in         │
├──────────────────────────────────────────────────────────────┤
│  Unit tests       src/**/*.test.ts           node (vitest)   │
│  Component tests  *.stories.tsx              chromium        │
│  Lighthouse CI    lighthouserc.json          chromium (lhci) │
│  E2E smoke        e2e/smoke.spec.ts          chromium        │
│  E2E auth         e2e/auth.spec.ts           chromium        │
│  E2E a11y         e2e/a11y.spec.ts           chromium + axe  │
└──────────────────────────────────────────────────────────────┘
```

Every layer runs against a production build so what we test matches
what ships (no dev-only short-circuits).

## Unit tests

```bash
pnpm test            # one-shot run
pnpm test:watch      # interactive
```

301 tests across 32 files; full suite runs in ~3s. Should stay
green on every commit.

Pattern:
- `vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))`
  at the top of any test that touches mutations
- Server actions test: input validation + auth failure + each
  user-visible error path + the friendly-error mapping
- Privacy contracts get anti-regression tests (e.g. `relativeDay`
  asserts no clock-time output)
- `formatError` fixtures must be realistic — Postgres errors need
  a `code` field, not just `message` (friendly-error mapping is
  keyed on code)

## Component tests (Storybook)

Storybook stories double as test fixtures via
`@storybook/addon-vitest`. Run via:

```bash
pnpm storybook                     # interactive at :6006
pnpm test --project storybook      # headless run
```

Real Chromium via Playwright. Catches render regressions, prop
shape changes, and (with `@storybook/addon-a11y`) accessibility
violations surfaced interactively.

**Known gap (pnpm hoisting bug):** `test --project storybook`
currently errors with "Failed to fetch dynamically imported
module: setup-file-with-project-annotations.js" on this repo. The
systematic a11y gate moved to `e2e/a11y.spec.ts` (see below) to
route around it. Storybook autodocs still render in the interactive
dev server — only the headless vitest-project run is affected.

## Lighthouse CI

```bash
pnpm lhci            # collect + assert + upload (full pipeline)
pnpm lhci:collect    # collect only
pnpm lhci:assert     # assert against existing collected runs
```

Configured in `lighthouserc.json`. Spawns `pnpm next start --port 4123`
in the background, runs Lighthouse against `/` and `/privacy`,
asserts on configured score thresholds, uploads the report to
temporary public storage (URL printed in stdout).

First-time setup:

```bash
npx playwright install chromium
export CHROME_PATH=~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome
```

Current assertions:

- `accessibility ≥ 0.85` (error)
- `best-practices ≥ 0.85` (warn)
- `seo ≥ 0.9` (warn)
- `color-contrast`, `image-alt`, `label`, `html-has-lang`,
  `meta-viewport` → error if any audit fails

Performance is intentionally not asserted yet — the cold-cache
score is dominated by the auth bootstrap, so the warm number is
what matters and lhci can't measure that directly. Current live
scores: 1.00 across every asserted category on `/` and `/privacy`.

## End-to-end (Playwright)

```bash
pnpm e2e             # headless run against pnpm next start
pnpm e2e:headed      # visible browser — useful for debugging
pnpm e2e:debug       # one-step Playwright Inspector
```

`playwright.config.ts` spins up `pnpm next start --port 4173` in
the background. Per-test contexts default-isolate cookies + storage
so sign-in flows don't bleed between specs.

### `e2e/smoke.spec.ts` — production-build contracts

No auth needed:

- Home / login / privacy render with correct status + no console
  errors
- `/manifest.json` shape (PWA fields, ≥192px icon, maskable entry)
- `/favicon.ico`, `/og-image.png`, `/sw.js` all serve

### `e2e/auth.spec.ts` — sign-in flow against live Supabase

Requires:

```bash
export E2E_TEST_EMAIL=e2e-test@chork.app
export E2E_TEST_PASSWORD=…
```

Without these env vars the suite skips. The test user must already
exist (we don't sign up new accounts in tests — that pollutes
production with throwaways). Covers sign-in success + `?next=`
deep-link redirect + wrong-password error toast.

### `e2e/a11y.spec.ts` — axe-core systematic gate

Runs axe-core against `/`, `/login`, `/privacy` in both light +
dark color schemes (6 tests total). `page.emulateMedia({ colorScheme })`
forces the scheme per test so results are deterministic regardless
of Playwright's default.

Gate: zero violations. Matches the same standard our manual
Lighthouse pass hit after G1-G4.

## Manual verification — where E2E can't reach

Some invariants are hard to assert in Playwright without a
disposable test database. Run these by hand before shipping a
release:

- **Log-a-send flow** (touches mutations in a way that pollutes
  the shared Supabase project — needs a cleanup step we haven't
  wired up yet)
- **Push notification dispatch** against a real browser
  subscription (requires VAPID env + a subscribed test device —
  OS-level permission flow isn't browser-automatable)
- **iOS PWA splash screens** — test on a real iPhone / iPad via
  the Tailscale preview; desktop emulation doesn't trigger the
  `apple-touch-startup-image` path
- **Adaptive icons** — run `pnpm exec node scripts/gen-apple-icons.mjs`
  after any brand-mark change to regenerate
  `apple-touch-icon-{light,dark}.png`. Verify both variants look
  correct in their target mode, then add the device to home screen
  in each OS theme to confirm iOS picks up the right one at install
  time. `/icon.svg` handles browser-tab adaptivity runtime via
  internal `@media (prefers-color-scheme)` — open in Firefox +
  Chrome + Safari and flip OS theme to verify the repaint
- **Cross-browser visual regression** — only Chromium runs in CI;
  eyeball the Safari + Firefox renders on `/` + `/profile` before
  any UI-heavy release

## Known verification gaps (ordered)

These are tracked here rather than buried in commit messages — the
list is intentionally short so it stays usable.

1. **`pushsubscriptionchange` in the service worker.** Push
   services (Apple especially) occasionally rotate a subscription's
   endpoint. Without an SW listener we miss the rotation and the
   device silently stops receiving pushes; current mitigation is
   the 404/410 eviction path in `sendPushToUsers`, so the DB
   eventually catches up but the user experiences a dead channel
   in the meantime. Fix needs a small REST endpoint (service
   workers can't call server actions) — deferred until VAPID is
   wired on prod and we actually see rotation in the wild.
2. **`getGymClimberUserIds` dedups in JS.** `src/lib/push/server.ts`
   selects every `route_logs.user_id` for a gym and `new Set()`s
   client-side. Fine for early gyms, potentially noisy at scale —
   swap to a `SELECT DISTINCT` RPC once any gym crosses ~50k logs.
3. **Storybook headless vitest-project run** (pnpm hoisting bug,
   see above). Workaround in place via `e2e/a11y.spec.ts`, but the
   proper fix is to stop hoisting `setup-file-with-project-annotations.js`.

## Security verification

- **`notify_user` is service-role-only** since migration 040. Any
  change to the notification RPC signature must re-verify the grant
  (the `authenticated` role should never regain execute).
- **Leaderboard cached RPCs are service-role-only** since migration
  039. Page-level membership check must stay upstream of
  `getLeaderboardCached` / `getGymStatsV2Cached`.
- **`formatError` never leaks Postgres `details` / `hint` in prod**
  (asserted in `src/lib/errors.test.ts`). Friendly-code mapping
  (23505, 23503, 23514, 23502, 42501, PGRST116, PGRST301) must
  stay in sync with the strings the app surfaces.
- **Service-role client is import-guarded** with `import "server-only"`
  at the top of `src/lib/supabase/server.ts`. Any module that pulls
  it into a `"use client"` bundle will trip a build error — if you
  see one, split the helper so the cached-context chain stays on
  the server.
