/**
 * Pure debouncer factory — no React. Captures the timerRef + pendingRef
 * + latest-flush state that RouteLogSheet and JamLogSheet independently
 * hand-rolled. `useDebouncedFlush` is a thin React wrapper around this.
 *
 * Kept in a separate module so it can be unit-tested in the Node-only
 * vitest project without a React render environment.
 *
 * Generic over the value type `T`. `null` is reserved internally as
 * "no pending value" — `T` should not be intentionally `null` for a
 * meaningful value (wrap in an object or use a sentinel of your own).
 *
 * Guarantees:
 * 1. Multiple `schedule` calls within `delayMs` collapse to one fire
 *    with the LATEST value.
 * 2. `setFlush(fn)` replaces the callback so the latest is invoked
 *    when the timer fires (React wrapper writes this from a commit-
 *    phase effect).
 * 3. `dispose()` (the React wrapper's unmount cleanup) flushes any
 *    pending value synchronously via the latest callback, so a sheet
 *    closed during a debounce window doesn't drop the user's write.
 */
export interface Debouncer<T> {
  /** Replace any pending value + restart the debounce window. */
  schedule: (value: T) => void;
  /** Drop the pending value + clear the timer. No fire. */
  cancel: () => void;
  /** Fire the pending value immediately + clear the timer. No-op if nothing pending. */
  flushPending: () => void;
  /** Replace the flush callback. The latest is invoked when the timer fires. */
  setFlush: (flush: (value: T) => void | Promise<void>) => void;
  /**
   * Called by the React wrapper's unmount cleanup. Fires any pending
   * value synchronously and clears the timer. Safe to call multiple
   * times.
   */
  dispose: () => void;
}

interface CreateOptions<T> {
  delayMs: number;
  flush: (value: T) => void | Promise<void>;
}

export function createDebouncer<T>({ delayMs, flush }: CreateOptions<T>): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  let current = flush;

  function fire(value: T) {
    void current(value);
  }

  return {
    schedule(value: T) {
      pending = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        pending = null;
        fire(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },
    flushPending() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending !== null) {
        const value = pending;
        pending = null;
        fire(value);
      }
    },
    setFlush(next) {
      current = next;
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        if (pending !== null) {
          const value = pending;
          pending = null;
          fire(value);
        }
      }
    },
  };
}
