"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches. Live, not a mount-time read.
 *
 * The server can't know; it answers `false`, and the client snapshot
 * corrects it before paint — the same shape as
 * useViewTransitionsEnabled.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
