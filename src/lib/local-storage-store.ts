/**
 * useSyncExternalStore-over-localStorage bridge factory. Replaces the
 * two hand-rolled ~30-line copies (auth-context's profile cache and
 * NavBar's crew-invite ack) with one implementation that encodes the
 * subtle contracts:
 *
 * - The native `storage` event fires only for OTHER tabs. Same-tab
 *   writes must dispatch a custom event (`eventName`) so this tab's
 *   subscribers re-read too. `write()` always dispatches — even when
 *   localStorage is blocked — so subscribers stay coherent.
 * - `getSnapshot` must return REFERENTIALLY STABLE values or
 *   useSyncExternalStore loops forever. Parsed results are memoised
 *   per raw string: the same stored string always yields the same
 *   object reference. (Consequence, inherited from the original
 *   profile-cache impl: TTL/validity is evaluated when the raw value
 *   changes, not continuously — an entry read once stays served for
 *   the session even if it crosses its TTL while the tab is open.)
 * - SSR-safe: `getServerSnapshot` (and any pre-window call) returns
 *   null, so server + client-initial render match exactly.
 * - localStorage can throw (private mode, quota, blocked third-party
 *   storage) — every touch is wrapped; reads degrade to null, writes
 *   to no-ops.
 *
 * The pure raw→value pipeline lives in `createSnapshotReader` so the
 * codec / TTL / memoisation contracts unit-test in the Node-only
 * vitest project without a window.
 */

export interface LocalStorageStoreOptions<T> {
  /**
   * Custom event dispatched on same-tab writes (e.g.
   * "chork-profile-cache"). Native `storage` covers other tabs.
   */
  eventName: string;
  /** Decode the raw string. Throw or return null for a miss. Defaults to JSON.parse. */
  parse?: (raw: string) => T | null;
  /** Encode a value for storage. Defaults to JSON.stringify. */
  serialize?: (value: T) => string;
  /**
   * Entries older than this are treated as misses (evaluated on
   * read, when the raw value changes). Requires `timestampOf`.
   */
  ttlMs?: number;
  /** Extract the entry's written-at epoch ms for the TTL check. */
  timestampOf?: (value: T) => number;
  /** Extra structural validation after parse — false ⇒ miss. */
  isValid?: (value: T) => boolean;
  /** Clock injection for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface LocalStorageStore<T> {
  /** Referentially-stable client snapshot (null = missing/expired/invalid). */
  getSnapshot: () => T | null;
  /** SSR snapshot — always null so server and client-initial render agree. */
  getServerSnapshot: () => null;
  /** Subscribe to cross-tab (`storage`) + same-tab (custom event) changes. */
  subscribe: (callback: () => void) => () => void;
  /** Write a value (null = remove). Always notifies same-tab subscribers. */
  write: (value: T | null) => void;
}

/**
 * Pure half: builds a memoising `(raw) => T | null` reader from the
 * codec + validity options. Same raw in ⇒ same reference out.
 */
export function createSnapshotReader<T>(
  options: Pick<
    LocalStorageStoreOptions<T>,
    "parse" | "ttlMs" | "timestampOf" | "isValid" | "now"
  >,
): (raw: string | null) => T | null {
  const {
    parse = (raw: string) => JSON.parse(raw) as T,
    ttlMs,
    timestampOf,
    isValid,
    now = Date.now,
  } = options;

  let lastRaw: string | null | undefined;
  let lastValue: T | null = null;

  return (raw: string | null): T | null => {
    if (raw === lastRaw) return lastValue;
    lastRaw = raw;
    lastValue = null;
    if (raw !== null) {
      try {
        const parsed = parse(raw);
        if (
          parsed !== null &&
          (isValid === undefined || isValid(parsed)) &&
          (ttlMs === undefined ||
            timestampOf === undefined ||
            now() - timestampOf(parsed) <= ttlMs)
        ) {
          lastValue = parsed;
        }
      } catch {
        // Corrupt entry — treat as a miss.
      }
    }
    return lastValue;
  };
}

export function createLocalStorageStore<T>(
  key: string,
  options: LocalStorageStoreOptions<T>,
): LocalStorageStore<T> {
  const { eventName, serialize = (value: T) => JSON.stringify(value) } = options;
  const read = createSnapshotReader<T>(options);

  return {
    getSnapshot() {
      if (typeof window === "undefined") return null;
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        // Blocked storage — degrade to a miss.
      }
      return read(raw);
    },

    getServerSnapshot() {
      return null;
    },

    subscribe(callback: () => void) {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", callback);
      window.addEventListener(eventName, callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(eventName, callback);
      };
    },

    write(value: T | null) {
      if (typeof window === "undefined") return;
      try {
        if (value === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, serialize(value));
        }
      } catch {
        // localStorage can throw under quota / private mode —
        // silently skip; callers fall back to their network paths.
      }
      // Same-tab notify — ALWAYS, even when storage threw, so
      // subscribers re-read and stay coherent with whatever the
      // store actually holds.
      window.dispatchEvent(new Event(eventName));
    },
  };
}
