"use client";

import { useState, useEffect, useSyncExternalStore, useCallback } from "react";
import { mutationQueue } from "./mutation-queue";
import { registerActionRunner } from "./action-map";

// Register the action runner once when this module loads in the browser
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
export function useNetworkStatus(): { isOnline: boolean; pendingCount: number } {
  ensureRegistered();

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // Subscribe to mutation queue count via useSyncExternalStore-like pattern
  const [pendingCount, setPendingCount] = useState(0);

  const handleFlush = useCallback(() => {
    if (navigator.onLine) {
      mutationQueue.flush();
    }
  }, []);

  useEffect(() => {
    // Initial count
    mutationQueue.count().then(setPendingCount);

    // Subscribe to queue changes
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
        mutationQueue.flush();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    // Flush on mount if online and there are pending mutations
    handleFlush();

    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [handleFlush]);

  return { isOnline, pendingCount };
}
