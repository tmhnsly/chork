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
 * True when the error string returned from a server action is one of
 * our auth sentinels. Currently only one sentinel, but wrapped in a
 * predicate so callers don't lean on string equality directly.
 */
export function isAuthRequiredError(error: string): boolean {
  return error === AUTH_REQUIRED_ERROR;
}
