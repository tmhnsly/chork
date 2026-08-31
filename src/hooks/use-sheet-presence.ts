"use client";

import { useState } from "react";

/**
 * Keeps a sheet's content alive through its exit animation.
 *
 * A bottom sheet that is conditionally mounted — `{selected && <Sheet
 * open .../>}` — can never animate out: the moment the value clears,
 * React unmounts the sheet and Radix has nothing left to run
 * `data-state="closed"` on. That is why routes on the Card page
 * vanished while the achievements sheet slid away politely; the
 * difference was mount style, not sheet.
 *
 * Passing the value through here returns the LAST non-null one, so a
 * closing sheet keeps rendering the content it was showing until the
 * animation finishes:
 *
 *     const shown = useSheetPresence(selectedRoute);
 *     return shown && (
 *       <RouteLogSheet open={selectedRoute !== null} route={shown} … />
 *     );
 *
 * Two bugs, one fix. It also stops a sheet flashing its *other* view
 * on the way out — the achievements detail used to snap back to the
 * catalogue grid as it closed, because closing cleared the view and
 * the body re-rendered the grid mid-animation.
 *
 * State adjusted during render — React's documented derived-state
 * pattern, and the house one (see the keyed-cache note in
 * CLAUDE.md's performance invariants). Not a ref: `react-hooks/refs`
 * rightly refuses ref reads in a render body, and this value IS
 * rendered. Not an effect: `react-hooks/set-state-in-effect` refuses
 * that too, and an effect would paint one frame of empty sheet first.
 */
export function useSheetPresence<T>(value: T | null | undefined): T | null {
  const [held, setHeld] = useState<T | null>(null);
  if (value != null && value !== held) {
    // Re-renders immediately, before the browser paints — the
    // sanctioned "adjusting state while rendering" path.
    setHeld(value);
  }
  return value ?? held;
}
