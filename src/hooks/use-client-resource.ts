"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeErrorEntry,
  resolveResource,
  shouldFetch,
  type ResourceCache,
  type ResourceEntry,
  type ResourceView,
} from "@/lib/client-resource";

export type { ResourceCache } from "@/lib/client-resource";
export { createResourceCache } from "@/lib/client-resource";

export interface UseClientResourceOptions<T> {
  /**
   * Gate the fetch. While false nothing fires and `loading` stays
   * false; already-settled data for the current key keeps showing.
   * Use for "fetch on open" sheets and "query long enough" searches.
   */
  enabled?: boolean;
  /**
   * Delay before the fetch fires; a key change (or disable) inside
   * the window cancels the pending fetch. Covers the debounced-search
   * pattern without a separate timer at the call site.
   */
  debounceMs?: number;
  /**
   * Optional module-level TTL cache (`createResourceCache`). When
   * provided the hook seeds synchronously from it on mount (no
   * shimmer on a fresh re-open), skips the network while an entry is
   * fresh, and writes successful results through.
   */
  cache?: ResourceCache<T>;
  /**
   * Keep showing the previous key's data while the new key fetches
   * (and after a failed refresh). `loading` still derives from the
   * key mismatch. For always-visible chrome like NavBar badges.
   */
  keepPreviousData?: boolean;
}

export interface UseClientResourceResult<T> extends ResourceView<T> {
  /** Drop the module cache entry (if any) and refetch the current key. */
  reload: () => void;
  /**
   * Patch the settled data in place (optimistic local updates, e.g.
   * flipping `has_pending_invite` after sending an invite). No-op
   * while loading/errored. Writes through to the module cache.
   */
  mutate: (updater: (prev: T) => T) => void;
}

/**
 * One deep hook for the client-side read scaffolding that used to be
 * hand-rolled per component: fetch-in-effect with a cancelled guard,
 * keyed-cache loading derivation (no `setState(null)` in effects —
 * see CLAUDE.md performance invariants), stale-response rejection,
 * optional debounce, optional module-level TTL cache, and refetch.
 *
 * `key` must encode every input the fetch depends on (the same way a
 * useEffect dep array would). `fetcher` receives the key it's being
 * run for; its identity may change every render — the latest is used.
 *
 * Pure cache/keying logic lives in `src/lib/client-resource.ts` with
 * its own unit tests; this file is thin React wiring.
 */
export function useClientResource<T>(
  key: string,
  fetcher: (key: string) => Promise<T>,
  options: UseClientResourceOptions<T> = {},
): UseClientResourceResult<T> {
  const { enabled = true, debounceMs, cache, keepPreviousData = false } = options;

  const [token, setToken] = useState(0);
  // Lazy initialiser (the sanctioned home for clocked reads — the
  // TTL check inside cache.get uses Date.now) seeds synchronously
  // from the module cache so a warm re-mount never shows a shimmer.
  const [entry, setEntry] = useState<ResourceEntry<T> | null>(() => {
    const hit = cache?.get(key);
    return hit === undefined
      ? null
      : { key, token: 0, status: "success", data: hit };
  });

  // Latest-value refs, written from commit-phase effects (never in
  // the render body — react-hooks/refs).
  const fetcherRef = useRef(fetcher);
  const cacheRef = useRef(cache);
  const keyRef = useRef(key);
  const entryRef = useRef(entry);
  useEffect(() => {
    fetcherRef.current = fetcher;
    cacheRef.current = cache;
    keyRef.current = key;
    entryRef.current = entry;
  });

  // Tracks enabled false→true transitions so a settled ERROR retries
  // when the surface is re-opened (matches the hand-rolled "loaded"
  // flag semantics) without retry-looping while it stays open.
  const prevEnabledRef = useRef(false);

  useEffect(() => {
    const reEnabled = enabled && !prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    if (!shouldFetch({ entry, key, token, enabled, reEnabled })) return;

    let cancelled = false;

    const run = async () => {
      const ext = cacheRef.current;
      if (ext) {
        const hit = ext.get(key);
        if (hit !== undefined) {
          // Fresh module-cache hit — install it without a network
          // round-trip. The microtask hop keeps the setState out of
          // the effect's synchronous path (set-state-in-effect) and
          // resolves before paint, so no shimmer flashes.
          await Promise.resolve();
          if (!cancelled) setEntry({ key, token, status: "success", data: hit });
          return;
        }
      }
      try {
        const data = await fetcherRef.current(key);
        if (cancelled) return; // stale key/token — drop the resolve
        cacheRef.current?.set(key, data);
        setEntry({ key, token, status: "success", data });
      } catch (error) {
        if (cancelled) return;
        setEntry((prev) => makeErrorEntry(prev, key, token, error));
      }
    };

    let timer: number | undefined;
    if (debounceMs !== undefined && debounceMs > 0) {
      timer = window.setTimeout(() => void run(), debounceMs);
    } else {
      void run();
    }
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [key, token, enabled, entry, debounceMs]);

  const reload = useCallback(() => {
    cacheRef.current?.delete(keyRef.current);
    setToken((t) => t + 1);
  }, []);

  const mutate = useCallback((updater: (prev: T) => T) => {
    const prev = entryRef.current;
    if (!prev || prev.status !== "success") return;
    const next = { ...prev, data: updater(prev.data) };
    entryRef.current = next;
    cacheRef.current?.set(prev.key, next.data);
    setEntry(next);
  }, []);

  const view = resolveResource({ entry, key, token, enabled, keepPreviousData });

  return { ...view, reload, mutate };
}
