"use client";

import { useSyncExternalStore } from "react";

// View transitions run wherever the API exists. Chromium and Firefox
// have been recorded clean (Firefox with its in-page animations held
// for the length of a transition; styles/app/view-transitions.scss has
// why). Safari's remaining glitches are unpinned and are looked at with
// transitions ON, since a gate hides the evidence.
// Read through useSyncExternalStore so the server and the first
// client render agree (on), then the client snapshot decides.
const noSubscribe = () => () => {};
const supported = () => typeof document !== "undefined" && "startViewTransition" in document;

/** Whether this browser runs the app's view transitions. */
export function useViewTransitionsEnabled(): boolean {
  return useSyncExternalStore(noSubscribe, supported, () => true);
}
