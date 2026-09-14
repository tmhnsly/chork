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
