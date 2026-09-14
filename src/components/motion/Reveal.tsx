"use client";

import { ViewTransition, type ReactNode } from "react";
import { useViewTransitionsEnabled } from "@/lib/view-transitions";

/**
 * Wrap a `<Suspense>` boundary so its fallback → content swap
 * cross-fades instead of popping. React treats the swap as an update
 * of this boundary's content; the `reveal` class carries the fade
 * (styles/app/view-transitions.scss), and the group's default tween
 * carries any change in size, so a skeleton that guessed the height
 * a little wrong morphs rather than jumps.
 *
 * Scoped to the boundary it wraps — nothing else on the page is
 * snapshotted — which is why it is safe where a page-wide update
 * animation was not.
 */
export function Reveal({ children }: { children: ReactNode }) {
  const enabled = useViewTransitionsEnabled();
  if (!enabled) return <>{children}</>;
  return (
    <ViewTransition update="reveal" default="none">
      {children}
    </ViewTransition>
  );
}
