/**
 * Pure cache/keying logic behind `useClientResource` — no React.
 * Kept in a separate module so it can be unit-tested in the Node-only
 * vitest project without a render environment (same split as
 * `debouncer.ts` / `useDebouncedFlush`).
 *
 * The core trick is the KEYED CACHE: a fetched result is tagged with
 * the `key` (and reload `token`) it was fetched for. The component
 * derives `loading` from a key mismatch at render time instead of
 * calling `setState(null)` inside an effect — which Next 15's
 * `react-hooks/set-state-in-effect` rule forbids. A resolve that
 * lands after the key moved on simply never matches, so stale
 * responses are rejected structurally, not just via cancelled flags.
 */

/**
 * One settled fetch result. `token` is the reload counter the fetch
 * was issued under — bumping it via `reload()` invalidates an
 * otherwise-matching entry. Error entries may carry the previous
 * successful `data` forward so `keepPreviousData` consumers don't
 * flash back to empty when a background refresh fails.
 */
export type ResourceEntry<T> =
  | { key: string; token: number; status: "success"; data: T }
  | { key: string; token: number; status: "error"; error: unknown; data?: T };

export interface ResourceView<T> {
  /** Settled data for the CURRENT key (or previous data when `keepPreviousData`). */
  data: T | null;
  /** True while enabled with no settled result (success OR error) for the current key. */
  loading: boolean;
  /** The thrown value when the current key's fetch settled with an error. */
  error: unknown;
}

/** Is `entry` the settled result for exactly this key + reload token? */
export function isSettledFor<T>(
  entry: ResourceEntry<T> | null,
  key: string,
  token: number,
): boolean {
  return entry !== null && entry.key === key && entry.token === token;
}

/**
 * Should the effect kick off a fetch?
 *
 * - Success entries for the current key/token always skip — a
 *   component-level cache never refetches data it already has
 *   (GymSwitcher's "fetch the catalogue once per mount" semantics).
 * - Error entries skip too — EXCEPT when the resource was just
 *   re-enabled (`reEnabled`, e.g. a sheet re-opened). That preserves
 *   the hand-rolled behaviour where a failed lazy load retries on
 *   the next open, without ever retry-looping while the sheet stays
 *   up (the post-error effect re-run has `reEnabled === false`).
 */
export function shouldFetch<T>(args: {
  entry: ResourceEntry<T> | null;
  key: string;
  token: number;
  enabled: boolean;
  reEnabled: boolean;
}): boolean {
  const { entry, key, token, enabled, reEnabled } = args;
  if (!enabled) return false;
  if (!isSettledFor(entry, key, token)) return true;
  if (entry!.status === "error" && reEnabled) return true;
  return false;
}

/**
 * Derive the render-facing view from the single-entry cache. Pure —
 * called in the render body, so it must never touch Date/now.
 */
export function resolveResource<T>(args: {
  entry: ResourceEntry<T> | null;
  key: string;
  token: number;
  enabled: boolean;
  /**
   * When true, a stale entry's data keeps showing while the new key
   * fetches (NavBar's badge count must not flash to zero on route
   * change). Loading still derives from the key mismatch.
   */
  keepPreviousData?: boolean;
}): ResourceView<T> {
  const { entry, key, token, enabled, keepPreviousData = false } = args;
  const settled = isSettledFor(entry, key, token);

  let data: T | null = null;
  if (settled && entry!.status === "success") {
    data = entry!.data;
  } else if (keepPreviousData && entry !== null && entry.data !== undefined) {
    // Stale success entry, or an error entry carrying forward the
    // last good data.
    data = entry.data;
  }

  return {
    data,
    loading: enabled && !settled,
    error: settled && entry!.status === "error" ? entry!.error : null,
  };
}

/**
 * Build the error entry for a failed fetch, carrying the previous
 * entry's last good data forward for `keepPreviousData` consumers.
 */
export function makeErrorEntry<T>(
  prev: ResourceEntry<T> | null,
  key: string,
  token: number,
  error: unknown,
): ResourceEntry<T> {
  // Success entries always have data; error entries may carry it.
  const carried = prev?.data;
  return carried === undefined
    ? { key, token, status: "error", error }
    : { key, token, status: "error", error, data: carried };
}

// ── Module-level TTL cache ──────────────────────────────────

/**
 * Cross-mount cache with a TTL, shared at module level. Covers the
 * ClimberSheet "tap to peek, close, tap again inside 30s" flow: the
 * hook seeds synchronously from this cache on mount so a re-open
 * renders instantly with no shimmer, and skips the network fetch
 * while the entry is fresh.
 */
export interface ResourceCache<T> {
  /** Fresh value for `key`, or `undefined` on miss/expiry (expired entries are evicted). */
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
}

export function createResourceCache<T>(opts: {
  ttlMs: number;
  /** Clock injection for tests. Defaults to Date.now. */
  now?: () => number;
}): ResourceCache<T> {
  const { ttlMs, now = Date.now } = opts;
  const map = new Map<string, { value: T; at: number }>();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      map.set(key, { value, at: now() });
    },
    delete(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}
