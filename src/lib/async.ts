/**
 * Race a promise against a timeout. The returned promise resolves
 * with the inner result if it settles before `ms`, or rejects with a
 * `TimeoutError` once the timer fires.
 *
 * Use at UI boundaries where an underlying API can hang indefinitely
 * and the user-visible work can't sit on it — classic examples are
 * `navigator.serviceWorker.ready` (wedges on dev-server restart or
 * certain iOS state transitions) and WebSocket close handshakes.
 * Wrapping at the source (inside the helper that awaits the hazard)
 * is preferred over each caller re-wrapping.
 */
export class TimeoutError extends Error {
  constructor(ms: number, reason?: string) {
    super(reason ? `Timeout after ${ms}ms (${reason})` : `Timeout after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  reason?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms, reason)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
