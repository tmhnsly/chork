import { vi } from "vitest";
import { UUID_RE } from "@/lib/validation";
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
 * three `gate*Mutation` helpers are spies WITH the real prelude shape
 * as their implementation — uuid check with the caller's label, then
 * the primed `require*`, then the rate limiter — so a test that
 * primes `requireSignedIn` keeps working when its subject moves from
 * the hand-rolled prelude to the gate, a "rejects a malformed id"
 * assertion still tests the id check, and `expect(gate).not
 * .toHaveBeenCalled()` still proves validation ran first. Vitest's
 * `mockReset` restores the implementation given to `vi.fn(impl)`, so
 * the per-file `vi.resetAllMocks()` leaves the delegation intact.
 *
 * `enforce` is imported from `@/lib/rate-limit`: a test that mocks
 * that module can assert the bucket, and one that doesn't gets the
 * real fail-open (no Upstash in CI → `{ ok: true }`).
 *
 * Tests that want the rate limit or uuid gate exercised for real —
 * `match/actions.test.ts`, `auth.test.ts` — mock the supabase
 * primitives instead and leave this module alone.
 */
export function mockAuthModule() {
  const requireAuth = vi.fn();
  const requireSignedIn = vi.fn();
  const requireGymAdmin = vi.fn();

  type Options = { rateLimit: Parameters<typeof enforce>[0] | null };

  async function limited(options: Options, userId: string) {
    if (options.rateLimit === null) return null;
    const rl = await enforce(options.rateLimit, userId);
    return rl.ok ? null : { error: rl.error };
  }

  const gateClimberMutation = vi.fn(async (resourceId: string, label: string) => {
    if (!UUID_RE.test(resourceId)) return { error: `Invalid ${label}` };
    const auth = await requireAuth();
    if ("error" in auth) return auth;
    return (await limited({ rateLimit: "mutationsWrite" }, auth.userId)) ?? auth;
  });

  const gateSignedInMutation = vi.fn(async (
    resourceId: string | null,
    label: string,
    options: Options = { rateLimit: "mutationsWrite" },
  ) => {
    if (resourceId !== null && !UUID_RE.test(resourceId)) {
      return { error: `Invalid ${label}` };
    }
    const auth = await requireSignedIn();
    if ("error" in auth) return auth;
    return (await limited(options, auth.userId)) ?? auth;
  });

  const gateGymAdminMutation = vi.fn(async (
    gymId: string,
    label: string,
    options: Options = { rateLimit: null },
  ) => {
    if (!UUID_RE.test(gymId)) return { error: `Invalid ${label}` };
    const auth = await requireGymAdmin(gymId);
    if ("error" in auth) return auth;
    return (await limited(options, auth.userId)) ?? auth;
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
    gateClimberMutation,
    gateSignedInMutation,
    gateGymAdminMutation,
  };
}
