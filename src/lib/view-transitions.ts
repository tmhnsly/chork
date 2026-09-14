"use client";

import { useSyncExternalStore } from "react";

// Firefox's same-document view transitions are a few releases old
// and glitch on this app in ways we can't yet drive from automation
// (Chrome verified clean). Until it is verified there, Firefox gets
// instant navigation and a still ground. Read through
// useSyncExternalStore so the server and first client render agree
// (transitions on), then the client snapshot switches it off.
const noSubscribe = () => () => {};
const isFirefox = () => /firefox/i.test(navigator.userAgent);

/** Whether this browser runs the app's view transitions. */
export function useViewTransitionsEnabled(): boolean {
  return useSyncExternalStore(noSubscribe, () => !isFirefox(), () => true);
}
