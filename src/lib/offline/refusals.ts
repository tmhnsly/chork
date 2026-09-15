// Refusals the offline queue must never retry. Server action results
// cross the server→client boundary as plain strings, so, like
// `auth-errors.ts`, this module has no dependencies and is imported from
// both sides. The queue matches these exact strings.

/**
 * The route a log was for no longer exists, because its game was deleted
 * (migration 141). Withdrawing a route only stamps `withdrawn_at`, which
 * `upsert_match_log` doesn't check, so it never refuses this way. Shown
 * as-is when it happens online.
 */
export const ROUTE_GONE_ERROR = "That route isn't in the game any more";

/** True when retrying can never succeed, so the queue discards the entry. */
export function isPermanentRefusal(error: string): boolean {
  return error === ROUTE_GONE_ERROR;
}
