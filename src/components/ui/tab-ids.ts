/**
 * Id helpers shared by the two tab-capable controls
 * (`SegmentedControl`, `TabPills`) and the panels they drive.
 *
 * The ARIA tabs pattern is a two-way wiring: each tab points at its
 * panel with `aria-controls`, and the panel points back at the
 * SELECTED tab with `aria-labelledby`. Both ends have to agree on the
 * id, so it's derived here rather than hand-written at each surface —
 * a mismatch is silent, and the only symptom is a screen reader
 * announcing the wrong thing.
 */

/** Stable id for the tab representing `value` within `panelId`. */
export function tabId(panelId: string, value: string | number | null): string {
  return `${panelId}-tab-${String(value ?? "none")}`;
}
