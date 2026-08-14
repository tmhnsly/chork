import { mutationQueue } from "./mutation-queue";
import type { OfflineAction } from "./types";

/**
 * Wraps a server action to queue it in IndexedDB when offline or when the
 * network request fails. Returns a synthetic success so the optimistic UI
 * (already applied before the call) stays in place.
 *
 * The synthetic shape is `{ success: true, log: null }` — matching what
 * the queued actions return on the online path, minus the row we don't
 * have yet. Callers must therefore treat `log` as optional.
 */

/**
 * Shown when the mutation could neither be sent NOR queued. The only
 * way that happens today is an unresolved session (see
 * `mutationQueue.enqueue`), which a re-auth fixes.
 */
const QUEUE_FAILED_ERROR =
  "Couldn't save that — check you're still signed in and try again.";

export function withOfflineQueue<
  T extends (...args: never[]) => Promise<unknown>,
>(
  actionName: OfflineAction,
  serverAction: T,
  extractRouteId: (...args: Parameters<T>) => string,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  /**
   * Queue the mutation and report honestly whether it landed.
   *
   * `enqueue` returns false when no user resolves (session not yet
   * hydrated from localStorage, or `getSession()` threw). This used
   * to be ignored and a synthetic success returned anyway — so the
   * climber got a send toast and a flipped tile for a log that was
   * never written anywhere and never replayed. Silent data loss.
   */
  async function queueOrFail(
    args: Parameters<T>,
  ): Promise<ReturnType<T>> {
    const queued = await mutationQueue.enqueue({
      action: actionName,
      args,
      routeId: extractRouteId(...args),
    });
    if (!queued) return { error: QUEUE_FAILED_ERROR } as ReturnType<T>;
    return { success: true, log: null } as ReturnType<T>;
  }

  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (navigator.onLine) {
      try {
        return (await serverAction(...args)) as ReturnType<T>;
      } catch (err) {
        // Queue only when the failure looks like TRANSPORT, not
        // rejection: a fetch-level TypeError, or the connection
        // having dropped while the request was in flight (we were
        // online when we started, we aren't now).
        //
        // Previously this tested `err instanceof TypeError` alone,
        // so a connection that died mid-request in any other shape
        // rethrew — losing the log AND, because the callers didn't
        // catch, leaving the sheet stuck mid-submit.
        //
        // A genuine server rejection still rethrows: replaying a
        // request the server has already refused would just burn the
        // retry budget and drop it later, further from the user.
        if (err instanceof TypeError || !navigator.onLine) {
          return queueOrFail(args);
        }
        throw err;
      }
    }

    // Offline — queue immediately
    return queueOrFail(args);
  };
}
