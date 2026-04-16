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

## What's not covered yet

- **End-to-end flows** (login → log a send → leaderboard)
- **Push notification dispatch** test against a real subscription
- **Cross-browser visual regression** — only chromium runs locally

These are tracked as F2/F3/G2 in the rolling backlog.
