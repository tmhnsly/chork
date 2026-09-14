"use client";

import { useSyncExternalStore } from "react";

// View transitions run on Chromium only. The API exists in Safari 18+
// and Firefox 144+, but both glitch on this app in ways we can't yet
// drive from automation, and Chromium is the one engine verified
// clean navigation by navigation. An allowlist, not a denylist: a
// browser earns the transitions once it's been watched. Everything
// else — streaming shells, skeletons, the page rhythm — is engine-
// agnostic. Read through useSyncExternalStore so the server and the
// first client render agree (off), then the client snapshot decides.
const noSubscribe = () => () => {};

function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
    .userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium/i.test(b.brand));
  return /Chrome\//.test(navigator.userAgent) && !/Edg\/|OPR\//.test(navigator.userAgent)
    ? true
    : /Edg\//.test(navigator.userAgent);
}

/** Whether this browser runs the app's view transitions. */
export function useViewTransitionsEnabled(): boolean {
  return useSyncExternalStore(noSubscribe, isChromium, () => false);
}
