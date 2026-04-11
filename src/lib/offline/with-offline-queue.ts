import { mutationQueue } from "./mutation-queue";
import type { OfflineAction } from "./types";

/**
 * Wraps a server action to queue it in IndexedDB when offline or when the
 * network request fails. Returns a synthetic success so the optimistic UI
 * (already applied before the call) stays in place.
 */
export function withOfflineQueue<
  T extends (...args: never[]) => Promise<unknown>,
>(
  actionName: OfflineAction,
  serverAction: T,
  extractRouteId: (...args: Parameters<T>) => string,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (navigator.onLine) {
      try {
        return (await serverAction(...args)) as ReturnType<T>;
      } catch (err) {
        // Network failure mid-request — queue it
        if (err instanceof TypeError) {
          await mutationQueue.enqueue({
            action: actionName,
            args,
            routeId: extractRouteId(...args),
          });
          return { success: true, log: null } as ReturnType<T>;
        }
        throw err;
      }
    }

    // Offline — queue immediately
    await mutationQueue.enqueue({
      action: actionName,
      args,
      routeId: extractRouteId(...args),
    });
    return { success: true, log: null } as ReturnType<T>;
  };
}
