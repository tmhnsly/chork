"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { mutationQueue } from "./mutation-queue";
import { registerActionRunner } from "./action-map";

let registered = false;
function ensureRegistered() {
  if (!registered && typeof window !== "undefined") {
    registerActionRunner();
    registered = true;
  }
}

/**
 * Track online/offline state and pending mutation count.
 * Triggers queue flush on `online` and `visibilitychange` events —
 * the visibilitychange handler is the iOS fallback for Background Sync.
 */
export function useNetworkStatus(): { isOnline: boolean; pendingCount: number; ready: boolean } {
  ensureRegistered();

  // Initialise from navigator on mount — avoids SSR mismatch by
  // defaulting to true (online) and correcting in the effect.
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(false);

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
