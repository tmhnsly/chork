# Verification

How to run each test layer locally + what they cover.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer            Where                  Runs in            │
├─────────────────────────────────────────────────────────────┤
│  Unit tests       src/**/*.test.ts       node (vitest)      │
│  Component tests  *.stories.tsx          chromium (vitest)  │
│  Lighthouse CI    lighthouserc.json      chromium (lhci)    │
│  E2E flows        (TBD — Playwright)     chromium           │
└─────────────────────────────────────────────────────────────┘
```

## Unit tests

```bash
pnpm test            # one-shot run
pnpm test:watch      # interactive
```

Pure functions, helpers, server actions with mocks. Fast (~2s for
the full suite). Should stay green on every commit.

Pattern:
- `vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))`
  at the top of any test that touches mutations
- Server actions test: input validation + auth failure + each
  user-visible error path + the friendly-error mapping

## Component tests

Storybook stories double as test fixtures via
`@storybook/addon-vitest`. Run via:

```bash
pnpm storybook       # interactive at :6006
pnpm test --project storybook   # headless run
```

Real Chromium via Playwright. Catches render regressions, prop
shape changes, and (with `@storybook/addon-a11y`) accessibility
violations.

## Lighthouse CI

```bash
pnpm lhci            # collect + assert + upload (full pipeline)
pnpm lhci:collect    # collect only
pnpm lhci:assert     # assert against existing collected runs
```

Configured in `lighthouserc.json`. Spawns `pnpm next start --port 4123`
in the background, runs Lighthouse against `/` and `/privacy`,
asserts on the configured score thresholds, uploads the report to
temporary public storage (URL printed in stdout).

The first time you run, install Chromium via Playwright if not
already present:

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
what matters and lhci can't measure that directly.

## End-to-end (Playwright)

```bash
pnpm e2e             # headless run against pnpm next start
pnpm e2e:headed      # visible browser — useful for debugging
pnpm e2e:debug       # one-step Playwright Inspector
```

`playwright.config.ts` spins up `pnpm next start --port 4173` in
the background. Per-test contexts default-isolate cookies + storage
so sign-in flows don't bleed between specs.

`e2e/smoke.spec.ts` — production-build contracts (no auth needed):

- Home / login / privacy render with correct status + no console
  errors
- /manifest.json shape (PWA fields, ≥192px icon, maskable entry)
- /favicon.ico, /og-image.png, /sw.js all serve

`e2e/auth.spec.ts` — sign-in flow against the live Supabase project.
Requires:

```bash
export E2E_TEST_EMAIL=e2e-test@chork.app
export E2E_TEST_PASSWORD=…
```

Without these env vars the suite skips. The test user must already
exist (we don't sign up new accounts in tests — that pollutes
production with throwaways). Cover sign-in success + ?next=
deep-link redirect + wrong-password error toast.

## What's not covered yet

- **Log-a-send flow** (touches mutations, needs cleanup)
- **Push notification dispatch** test against a real subscription
- **Cross-browser visual regression** — only chromium runs locally

These are tracked in the rolling backlog (F3 critical-path,
G2 axe-core, etc.).
