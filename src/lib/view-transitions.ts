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
// "like Gecko". Nested transitions stay off there until they are
// recorded clean. Firefox tears a snapshot whose content animates
// while the transition runs (revealText.module.scss has the
// recording), and a section revealing snapshots its skeleton, whose
// sheen never stops moving.
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
