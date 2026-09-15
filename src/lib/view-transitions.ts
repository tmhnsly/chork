"use client";

import { useSyncExternalStore } from "react";

// View transitions run wherever the API exists. Chromium is the one
// engine watched clean navigation by navigation; Safari 18+ and
// Firefox 144+ have shown glitches that haven't been pinned yet and
// are being looked at with them ON, since a gate hides the evidence.
// Read through useSyncExternalStore so the server and the first
// client render agree (on), then the client snapshot decides.
const noSubscribe = () => () => {};
const supported = () => typeof document !== "undefined" && "startViewTransition" in document;

/** Whether this browser runs the app's view transitions. */
export function useViewTransitionsEnabled(): boolean {
  return useSyncExternalStore(noSubscribe, supported, () => true);
}

// Gecko's UA carries a bare "Gecko/<date>"; Blink and WebKit say
// "like Gecko". Firefox Developer Edition 157 corrupts a page
// snapshot when a second transition starts while the page's own is
// still running — the frames alternate between the page and a
// shrunken, seamed copy of it — and the pages that glitched were
// exactly the ones whose sections start a nested transition on
// arrival (a share name morphing, a skeleton revealing). Chromium
// and WebKit take the nested ones in their stride.
const gecko = () => typeof navigator !== "undefined" && /\bGecko\/\d/.test(navigator.userAgent);
const nestedSupported = () => supported() && !gecko();

/**
 * Whether the transitions INSIDE a page run — a section revealing
 * over its skeleton, a shared element morphing, the board swapping
 * tabs. The page's own enter and exit are unaffected.
 */
export function useNestedViewTransitionsEnabled(): boolean {
  return useSyncExternalStore(noSubscribe, nestedSupported, () => true);
}
