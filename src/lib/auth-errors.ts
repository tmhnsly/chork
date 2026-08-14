// Shared auth-failure sentinels. Server action return values pass
// across the server→client boundary as plain strings, so the
// sentinels have to live in a module that's safe to import from
// both sides — auth.ts is `server-only` and mutation-queue.ts runs
// in the browser, so neither of them is a fit for the source of
// truth. This file is deliberately zero-dependency.
//
// The mutation queue matches on these exact strings to decide
// whether to pause the flush and wait for re-authentication. A
// substring match ("signed in") was previously used; that broke
// every time wording drifted in auth.ts and quietly let post-
// signout flushes keep retrying under stale cookies.

export const AUTH_REQUIRED_ERROR = "You need to be signed in to do that";

/**
 * `requireAuth` failed because the caller is signed in but has no
 * active gym — a first-class state, not an error (see CONTEXT.md
 * "Jam"). Gym-scoped pages branch on this to send the climber to
 * `/jam` rather than `/login`.
 *
 * A named constant because that branch is a STRING COMPARISON: while
 * this was a bare literal in two files, rewording the copy would have
 * silently routed every gymless climber to a login page they don't
 * need. Same reasoning as AUTH_REQUIRED_ERROR above.
 */
export const NO_GYM_ERROR = "No gym selected";

/** True when the failure is "signed in, but no gym selected". */
export function isNoGymError(error: string): boolean {
  return error === NO_GYM_ERROR;
}

/**
 * True when the error string returned from a server action is one of
 * our auth sentinels. Currently only one sentinel, but wrapped in a
 * predicate so callers don't lean on string equality directly.
 */
export function isAuthRequiredError(error: string): boolean {
  return error === AUTH_REQUIRED_ERROR;
}
