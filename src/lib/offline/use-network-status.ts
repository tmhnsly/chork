"use client";

import { useState, useEffect } from "react";
import { mutationQueue } from "./mutation-queue";
import { registerActionRunner } from "./registry";

let registered = false;
function ensureRegistered() {
  if (!registered && typeof window !== "undefined") {
    registerActionRunner();
    registered = true;
  }
}

/**
 * Track online/offline state and pending mutation count.
 * Triggers queue flush on `online` and `visibilitychange` events.
 *
 * These two are the ONLY flush triggers — there is no Background
 * Sync anywhere (`sw.js` registers no `sync` listener and nothing
 * calls `registration.sync.register`), so `visibilitychange` is the
 * primary mechanism on iOS rather than a fallback to one.
 */
export function useNetworkStatus(): { isOnline: boolean; pendingCount: number; ready: boolean } {
  ensureRegistered();

  // Initialise from navigator on mount — avoids SSR mismatch by
  // defaulting to true (online) and correcting in the effect.
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Defer state updates to avoid synchronous setState in effect
    const timer = requestAnimationFrame(() => {
      setIsOnline(navigator.onLine);
      setReady(true);
    });

    mutationQueue.count().then(setPendingCount);
    const unsubscribe = mutationQueue.subscribe(setPendingCount);

    function handleOnline() {
      setIsOnline(true);
      mutationQueue.flush();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible" && navigator.onLine) {
        setIsOnline(true);
        mutationQueue.flush();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    // Flush on mount if online and there are pending mutations
    if (navigator.onLine) {
      mutationQueue.flush();
    }

    return () => {
      cancelAnimationFrame(timer);
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return { isOnline, pendingCount, ready };
}
