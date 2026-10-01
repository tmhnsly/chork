"use client";

import { useMediaQuery } from "./use-media-query";

/** Whether the viewer has asked for reduced motion. Live, not a mount-time read. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
