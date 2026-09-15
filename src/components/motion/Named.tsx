"use client";

import { ViewTransition, type ReactNode } from "react";
import { useNestedViewTransitionsEnabled } from "@/lib/view-transitions";

interface Props {
  /** The view-transition name; the same name on two surfaces makes a share. */
  name: string;
  /**
   * `morph` — a cross-page share (the rank strip becoming the board):
   * the element travels and cross-fades. `reveal` — a skeleton
   * becoming its content in place.
   */
  share?: "morph" | "reveal";
  /** `tween` lets the element slide when a sibling lands; default none. */
  update?: "tween" | "none";
  children: ReactNode;
}

/**
 * A named view-transition participant, with the name switched OFF
 * while its page is arriving or leaving.
 *
 * A name written in CSS is on the element always, so during a route
 * change an element that exists on only one page becomes an
 * "old-only" group — and Safari animates those by shrinking the
 * snapshot toward nothing over the new page (Chrome merely fades
 * it). `enter="none"` / `exit="none"` deactivate the name in exactly
 * those cases; it stays active for a share (both pages have it) and
 * for in-page updates, which are the two things a name is for.
 */
export function Named({ name, share = "morph", update = "none", children }: Props) {
  const enabled = useNestedViewTransitionsEnabled();
  if (!enabled) return <>{children}</>;
  return (
    <ViewTransition name={name} default="none" enter="none" exit="none" share={share} update={update}>
      {children}
    </ViewTransition>
  );
}
