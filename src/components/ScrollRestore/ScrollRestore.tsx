"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Ensures the window starts at the top on every fresh render —
 * client-side navigation *and* hard refresh.
 *
 * Browsers normally restore the previous scroll position on refresh
 * ("scrollRestoration: auto"), which for an app with long streamed
 * pages lands the user mid-content instead of at the top. We flip
 * it to "manual" and handle it ourselves:
 *
 *   • On mount — scroll to top immediately and again on the next
 *     frame (covers cases where the browser tries to restore a
 *     stale position after layout settles).
 *   • On path change — scroll to top (client-side nav).
 *
 * Back / forward still reads naturally because the browser owns that
 * gesture before this effect runs.
 */
export function ScrollRestore() {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);

  // Turn off the browser's default scroll restoration once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const scrollTop = () =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });

    if (prev.current === null) {
      // First mount — hard refresh or initial nav. Scroll now and
      // again on the next frame to defeat any late browser
      // restoration attempt once the streamed content lays out.
      scrollTop();
      const id = requestAnimationFrame(scrollTop);
      prev.current = pathname;
      return () => cancelAnimationFrame(id);
    }

    if (prev.current !== pathname) {
      scrollTop();
      prev.current = pathname;
    }
  }, [pathname]);

  return null;
}
