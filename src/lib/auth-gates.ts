import { UUID_RE } from "./validation";
import type { LimiterKey, RateLimitResult } from "./rate-limit";

/**
 * The action gates: validate the id, authenticate, rate limit. One
 * call at the top of a server action, never re-typed by hand.
 *
 * The rule the interface carries: **a gate named `Mutation` always
 * rate limits.** A caller may name a different bucket; it cannot turn
 * the limit off, and the type says so. A read that needs the same id
 * check and sign-in opens with `gateSignedInRead`, whose name says
 * what it is.
 *
 * It used to be a matter of remembering. `gateGymAdminMutation`
 * defaulted to no limit, despite its name, and `action-hygiene.test.ts`
 * (which reads source text) took any call to it as limited, so
 * `createSet` shipped unlimited and passed. Reads went through
 * `gateSignedInMutation(…, { rateLimit: null })`, a mutation gate with
 * the mutation part switched off.
 *
 * Built by `makeGates` from the auth checks and the limiter, so there
 * is one implementation with two wirings: `auth.ts` passes the real
 * ones, `src/test/mock-auth.ts` passes spies. The test double used to
 * re-type all three preludes, defaults included, and could drift from
 * the thing it stood in for.
 */

type Failure = { error: string };
type Authed = { userId: string };

export interface GateDeps<A extends Authed, S extends Authed, G extends Authed> {
  /** Signed in with an active gym. */
  requireAuth: () => Promise<A | Failure>;
  /** Signed in; a gym is optional. */
  requireSignedIn: () => Promise<S | Failure>;
  /** An admin of the named gym. */
  requireGymAdmin: (gymId: string) => Promise<G | Failure>;
  enforce: (key: LimiterKey, userId: string) => Promise<RateLimitResult>;
}

/** A mutation gate's options. There is no way to say "no limit". */
export interface MutationGateOptions {
  rateLimit: LimiterKey;
}

const WRITE: MutationGateOptions = { rateLimit: "mutationsWrite" };

export function makeGates<A extends Authed, S extends Authed, G extends Authed>(
  deps: GateDeps<A, S, G>,
) {
  async function limited<T extends Authed>(auth: T, key: LimiterKey): Promise<T | Failure> {
    const rl = await deps.enforce(key, auth.userId);
    return rl.ok ? auth : { error: rl.error };
  }

  /**
   * Climber-side mutations on a gym's wall: a valid resource id, a
   * signed-in climber with an active gym (`requireAuth`), and the
   * standard write limit. `resourceLabel` shapes the error ("Invalid
   * route"), so callers keep their own wording.
   *
   * Checks unique to one action (attempts range, grade bounds) stay at
   * the call site, after the gate returns.
   */
  async function gateClimberMutation(
    resourceId: string,
    resourceLabel: string,
  ): Promise<A | Failure> {
    if (!UUID_RE.test(resourceId)) return { error: `Invalid ${resourceLabel}` };
    const auth = await deps.requireAuth();
    if ("error" in auth) return { error: auth.error };
    return limited(auth, WRITE.rateLimit);
  }

  /**
   * Gym-admin mutations that take a gym id: validates it, re-verifies
   * the caller admins THIS gym (never trust a client-supplied gymId),
   * and rate limits. Returns `isOwner` and the verified gym, so callers
   * can branch on owner-only operations without a second round-trip.
   *
   * An action that takes a set or route id uses `requireAdminOfSet` /
   * `requireAdminOfRoute` instead: they must fetch the resource before
   * they know which gym to authorise against.
   */
  async function gateGymAdminMutation(
    gymId: string,
    resourceLabel: string,
    options: MutationGateOptions = WRITE,
  ): Promise<G | Failure> {
    if (!UUID_RE.test(gymId)) return { error: `Invalid ${resourceLabel}` };
    const auth = await deps.requireGymAdmin(gymId);
    if ("error" in auth) return { error: auth.error };
    return limited(auth, options.rateLimit);
  }

  /**
   * Signed-in, gymless-safe mutations: games, friends, the profile,
   * and any write that must work without an active gym (CLAUDE.md "A
   * gym is optional"). `requireSignedIn`, NOT `requireAuth`.
   *
   * `resourceId` is null for an action that validates a payload
   * instead of an id (creating a game).
   */
  async function gateSignedInMutation(
    resourceId: string | null,
    resourceLabel: string,
    options: MutationGateOptions = WRITE,
  ): Promise<S | Failure> {
    if (resourceId !== null && !UUID_RE.test(resourceId)) {
      return { error: `Invalid ${resourceLabel}` };
    }
    const auth = await deps.requireSignedIn();
    if ("error" in auth) return { error: auth.error };
    return limited(auth, options.rateLimit);
  }

  /**
   * The same id check and sign-in for an action that only READS, and
   * is called too often to spend write budget: the live board's
   * refetches, a Chork round's allowance on every tap. Never limited.
   *
   * A write must not open with this. `action-hygiene.test.ts` refuses
   * one that does, and a read that reaches the database through an RPC
   * is listed there with its reason.
   */
  async function gateSignedInRead(
    resourceId: string | null,
    resourceLabel: string,
  ): Promise<S | Failure> {
    if (resourceId !== null && !UUID_RE.test(resourceId)) {
      return { error: `Invalid ${resourceLabel}` };
    }
    const auth = await deps.requireSignedIn();
    if ("error" in auth) return { error: auth.error };
    return auth;
  }

  return { gateClimberMutation, gateGymAdminMutation, gateSignedInMutation, gateSignedInRead };
}
