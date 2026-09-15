"use client";

import { useState } from "react";

/**
 * Keeps a sheet's content alive through its exit animation, and gives
 * every open a fresh sheet.
 *
 * A bottom sheet that is conditionally mounted — `{selected && <Sheet
 * open .../>}` — can never animate out: the moment the value clears,
 * React unmounts the sheet and Radix has nothing left to run
 * `data-state="closed"` on. Passing the value through here returns the
 * LAST non-null one, so a closing sheet keeps rendering what it showed
 * until the animation finishes. It also stops a sheet flashing its
 * *other* view on the way out (the achievements detail used to snap
 * back to the catalogue grid as it closed).
 *
 * The hold has a price: after the first open the sheet never unmounts,
 * so anything it seeded at mount outlives the selection. The Card's
 * route sheet seeds a reducer and a log-id ref from the route's log;
 * once it stopped unmounting, every tile after the first rendered the
 * first route's log and wrote attempts, sends and zones to it. So the
 * hook also returns an OPEN KEY that changes each time the sheet opens
 * from closed. Put it on the sheet as its `key`:
 *
 *     const [shown, openKey] = useSheetPresence(selectedRoute);
 *     return shown && (
 *       <RouteLogSheet key={openKey} open={selectedRoute !== null} route={shown} … />
 *     );
 *
 * The key holds through a close, so the exit animation plays on the
 * same mount, and through a value change while open, so navigating
 * inside one sheet (achievements' grid to badge) does not remount it.
 * Reopening even the same selection mounts fresh, so a log that changed
 * while the sheet was closed never renders stale.
 * `src/test/sheet-presence.test.ts` fails any element handed the held
 * value without the key.
 *
 * State adjusted during render — React's documented derived-state
 * pattern, and the house one (see the keyed-cache note in CLAUDE.md's
 * performance invariants). Not a ref: `react-hooks/refs` rightly
 * refuses ref reads in a render body, and this value IS rendered. Not
 * an effect: `react-hooks/set-state-in-effect` refuses that too, and an
 * effect would paint one frame of empty sheet first.
 */

export interface SheetPresence<T> {
  /** What to render: the live value, or the last one while closing. */
  held: T | null;
  /** The last value seen, to tell an open from a change while open. */
  last: T | null;
  /** Changes each time the sheet opens from closed. */
  openKey: number;
}

export function initialSheetPresence<T>(): SheetPresence<T> {
  return { held: null, last: null, openKey: 0 };
}

/** The pure transition behind the hook — unit-tested in `sheet-presence.test.ts`. */
export function nextSheetPresence<T>(
  prev: SheetPresence<T>,
  value: T | null | undefined,
): SheetPresence<T> {
  const next = value ?? null;
  if (next === prev.last) return prev;
  return {
    held: next ?? prev.held,
    last: next,
    openKey: prev.last === null && next !== null ? prev.openKey + 1 : prev.openKey,
  };
}

export function useSheetPresence<T>(
  value: T | null | undefined,
): [held: T | null, openKey: number] {
  const [presence, setPresence] = useState<SheetPresence<T>>(initialSheetPresence);
  const next = nextSheetPresence(presence, value);
  // Re-renders immediately, before the browser paints — the sanctioned
  // "adjusting state while rendering" path. The transition returns the
  // same object when nothing changed, so this settles in one pass.
  if (next !== presence) setPresence(next);
  return [next.held, next.openKey];
}
