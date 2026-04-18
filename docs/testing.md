# Testing

Vitest-based. Two projects split by what they need:

- **unit** (`src/**/*.test.ts`) — pure TS, mocked Supabase. Fast,
  offline, no secrets. This is `pnpm test`. Every commit should be
  green here.
- **integration** (`src/**/*.integration.test.ts`) — hits the real
  Supabase project configured in `.env.local`. Provisions test
  users + fixtures, asserts the RPC contract round-trips, cleans up.
  Opt-in via `pnpm test:integration`; silently no-ops in forks /
  CI that don't have `SUPABASE_SERVICE_ROLE_KEY`.

Run:

```bash
pnpm test                 # unit project
pnpm test:watch           # unit, watch mode
pnpm test --run crew      # filter by filename substring
pnpm test:integration     # integration project (hits real DB)
pnpm test:all             # unit + integration in sequence
```

The integration project exists specifically to catch the class of
bug that mocked unit tests can't: SQL that compiles locally but
errors at runtime (missing columns, `search_path` resolution, RLS
under unexpected role contexts, jsonb shape drift). See
`src/test/integration/` for the harness + the pattern for
expanding it.

---

## What we test and why

The point of these tests is **stability under change**, not a coverage
number. Five categories earn explicit coverage:

### 1. Privacy / domain invariants

Contracts that the product is built around. If someone "helpfully"
loosens one, the test catches it first.

- `src/lib/data/crew-time.test.ts` — `relativeDay()` never exposes
  clock time, hours, minutes, am/pm. Privacy contract
- `src/lib/data/logs.test.ts` — `computePoints` + `isFlash`
  encode the scoring formula. Never store derived values; these
  tests pin the derivation

### 2. Server-action boundaries

Every server action tests:

- Input validation (malformed UUIDs, length bounds, self-targeting)
- Auth failure returns a clean `{ error }` object, never throws
- Each distinct user-visible error path ("invite limit",
  "can't invite yourself", "already has an invite", etc.)
- DB error propagation — the Postgres `message` field surfaces,
  not a generic "something went wrong"
- Side-effect invocation where it matters (push fires on successful
  invite with the correct target + payload)
- Side-effect isolation — a push dispatch failure cannot unwind the
  already-committed DB write

Examples:
- `src/app/(app)/actions.test.ts` — climber-side actions
- `src/app/crew/actions.test.ts` — crew lifecycle (31 tests)
- `src/app/onboarding/actions.test.ts` — onboarding

### 3. Pure helpers

Anything with no I/O gets straightforward unit tests:

- `src/lib/stagger.test.ts` — animation delay helpers
- `src/lib/validation.test.ts` — username shape
- `src/lib/errors.test.ts` — error message extraction
- `src/lib/data/profile-stats.test.ts` — aggregates
- `src/lib/data/roles.test.ts` — role permissions matrix
- `src/lib/badges.test.ts` — badge evaluation
- `src/lib/data/set-label.test.ts` — display formatter

### 4. Type-level invariants

`src/lib/data/types.test.ts` asserts that generated supabase types
expose the shapes the rest of the app expects. Catches "I forgot
to regen types after a migration" before CI catches it with a
cryptic failure two layers deep.

### 5. Mutation-layer idempotency

`src/lib/data/mutations.test.ts` — `upsertRouteLog` uses
`onConflict: "user_id,route_id"`. If the offline queue ever replays
a mutation twice, no duplicate log rows. Tests assert the
`onConflict` clause explicitly.

---

## What we **don't** test and why

- **React render paths via RTL.** A button click that calls a
  server action is pass-through — the action test already covers
  the decision logic. Adding RTL would duplicate the assertion
  through a stack of DOM mocks. Skip unless the component itself
  has non-trivial state logic (keyed cache, optimistic rollback)
- **Supabase itself.** Its own tests exist upstream. We don't
  re-test that `.eq()` filters rows
- **Middleware behaviour in-depth.** `middleware.test.ts` covers
  the matcher shape. Behavioural tests for the cookie cache + auth
  gate would need heavy NextRequest / Supabase mocks for a handful
  of branches that are exercised on every prod request anyway. The
  ROI is low

---

## Mock patterns

### Mocking server actions

Follow the pattern in `src/app/(app)/actions.test.ts`:

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), requireSignedIn: vi.fn() }));
vi.mock("@/lib/data/mutations", () => ({ /* mock each used fn */ }));
```

Import the module under test **inside each test** via `await import(…)`
so `vi.mock()` is applied before the first import.

### Mocking the Supabase chain

Supabase clients build queries via chaining — `from().eq().eq().maybeSingle()`.
A helper that returns a thenable chain proxy resolves cleanly:

```ts
function makeChain(resolve: () => SbResult) {
  const builder = {};
  const chain = () => builder;
  for (const m of [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "or", "gte", "lt",
    "order", "limit", "maybeSingle", "single",
  ]) builder[m] = chain;
  builder.then = (onFulfilled) => Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}
```

See `src/app/crew/actions.test.ts` for the full pattern including
per-table / per-RPC priming.

### Realistic error fixtures

`formatError` uses the presence of both `code` and `message` to
detect a PostgrestError. Mocking just `{ message: "x" }` falls
through to the generic "Something went wrong" branch — tests that
assert on the specific message will fail. Always include `code`:

```ts
// good
{ error: { code: "23505", message: "duplicate key" } }

// breaks — falls through to generic message
{ error: { message: "duplicate key" } }
```

---

## Storybook vs tests

Stories are for visual QA and component-level UX review. Tests are
for correctness. They're separate concerns:

- Stories don't need to cover every state — just the ones a
  designer / reviewer wants to eyeball
- Tests should cover every state that could produce a wrong outcome,
  whether it's visible in Storybook or not

The overlap: mock factories in `src/test/mocks.ts` are shared by
both. If a migration adds a column to a table, both the mocks and
the stories + tests that consume them need updating. Typecheck
catches the miss at build time.

---

## Keeping the count honest

- `pnpm test --run` should **always** stay green. If CI is red on
  `main`, fix or revert — never skip
- Adding a feature without at least one action test is a yellow
  flag on review. Add one
- If a test is flaky, it's either testing something that shouldn't
  be tested or the code has a real race. Don't `.skip()` — fix it
