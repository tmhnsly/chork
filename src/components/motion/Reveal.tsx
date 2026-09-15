"use client";

import { Suspense, ViewTransition, type ReactNode } from "react";
import { useNestedViewTransitionsEnabled } from "@/lib/view-transitions";

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * A Suspense boundary whose fallback → content swap cross-fades
 * instead of popping.
 *
 * The fallback and the content each wear their own ViewTransition —
 * the skeleton animates its EXIT, the content its ENTER — and
 * nothing here has an `update` animation. A wrapper around the
 * boundary with an update class animated every transition-scheduled
 * change inside it, which snapshotted the whole boundary the moment
 * a sheet mounted mid-flush: the sheet painted inside the snapshot,
 * under the tiles, then popped over when the transition ended.
 * Enter and exit fire once, at mount and unmount, and cannot do that.
 */
export function Reveal({ fallback, children }: Props) {
  const enabled = useNestedViewTransitionsEnabled();
  if (!enabled) return <Suspense fallback={fallback}>{children}</Suspense>;
  return (
    <Suspense
      fallback={
        <ViewTransition exit="reveal-out" default="none">
          {fallback}
        </ViewTransition>
      }
    >
      <ViewTransition enter="reveal-in" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  );
}
