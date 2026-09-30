import { vi } from "vitest";
import { makeGates } from "@/lib/auth-gates";
import { enforce } from "@/lib/rate-limit";

/**
 * The one `@/lib/auth` test double, for tests that stub WHO the
 * caller is rather than exercising auth for real:
 *
 *   vi.mock("@/lib/auth", async () =>
 *     (await import("@/test/mock-auth")).mockAuthModule(),
 *   );
 *
 * Every `require*` helper is a bare `vi.fn()` the test primes. The
 * gates are the REAL ones (`makeGates` in `auth-gates.ts`), wired to
 * those spies instead of to Supabase: uuid check with the caller's
 * label, then the primed `require*`, then the rate limiter. So a test
 * that primes `requireSignedIn` exercises the actual prelude, a
 * "rejects a malformed id" assertion tests the real id check, and the
 * double cannot drift from the thing it stands in for. It used to
 * re-type all three preludes, defaults included.
 *
 * Each gate is wrapped in `vi.fn(impl)` so `expect(gate).not
 * .toHaveBeenCalled()` still proves validation ran first. Vitest's
 * `mockReset` restores the implementation given to `vi.fn(impl)`, so
 * the per-file `vi.resetAllMocks()` leaves the delegation intact.
 *
 * `enforce` is imported from `@/lib/rate-limit`: a test that mocks
 * that module can assert the bucket, and one that doesn't gets the
 * real fail-open (no Upstash in CI → `{ ok: true }`).
 *
 * Tests that want the auth checks themselves exercised —
 * `match/actions.test.ts`, `auth.test.ts` — mock the supabase
 * primitives instead and leave this module alone.
 */
export function mockAuthModule() {
  const requireAuth = vi.fn();
  const requireSignedIn = vi.fn();
  const requireGymAdmin = vi.fn();

  const gates = makeGates({
    requireAuth,
    requireSignedIn,
    requireGymAdmin,
    // Resolved per call, so a test's `vi.mock("@/lib/rate-limit")` is seen.
    enforce: (key, userId) => enforce(key, userId),
  });

  return {
    requireAuth,
    requireSignedIn,
    requireGymAdmin,
    requireAdminOfSet: vi.fn(),
    requireAdminOfRoute: vi.fn(),
    requireCompetitionOrganiser: vi.fn(),
    requireCompetitionOrganiserOrGymAdmin: vi.fn(),
    requireSameGymScope: vi.fn(),
    gateClimberMutation: vi.fn(gates.gateClimberMutation),
    gateSignedInMutation: vi.fn(gates.gateSignedInMutation),
    gateGymAdminMutation: vi.fn(gates.gateGymAdminMutation),
    gateSignedInRead: vi.fn(gates.gateSignedInRead),
  };
}
