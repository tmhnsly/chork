/**
 * The geometry behind `useFlip`, kept pure so it can be tested: the
 * hook only reads the DOM and writes two custom properties.
 */

export interface Point {
  x: number;
  y: number;
}

/** The parts of a DOMRect this needs. */
export interface Box {
  left: number;
  top: number;
  bottom: number;
}

/**
 * A computed `translate` value in px. Computed style gives "none",
 * "12px", "12px 4px" or "12px 4px 0px".
 */
export function parseTranslate(value: string | null | undefined): Point {
  if (!value || value === "none") return { x: 0, y: 0 };
  const [x = "0", y = "0"] = value.trim().split(/\s+/);
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
}

/**
 * Where an element sits in its container, in the container's own CSS
 * px: `drawn` includes the element's current `translate` (where it is
 * on screen mid-move), `layout` is its box without it (where it is
 * headed).
 *
 * `scale` is screen px per local px. Rects come back in screen px, but
 * a `translate` is applied in local px, so inside a zoomed container
 * (the marketing device is `zoom: 1.2` on desktop) an unscaled delta
 * is applied twice and every move overshoots by the zoom.
 *
 * `anchor` is the edge the y is read from; see `useFlip`.
 */
export function localPlace(
  rect: Box,
  origin: Box,
  scale: number,
  translate: Point,
  anchor: "top" | "bottom",
): { drawn: Point; layout: Point } {
  const s = scale > 0 ? scale : 1;
  const x = (rect.left - origin.left) / s;
  const y = (anchor === "bottom" ? rect.bottom - origin.bottom : rect.top - origin.top) / s;
  return { drawn: { x, y }, layout: { x: x - translate.x, y: y - translate.y } };
}

/**
 * The offset that holds an element where it was last drawn while its
 * box is already at `layout`, or null if it hasn't moved. Starting
 * from where it was DRAWN, not where it was headed, is what lets a
 * second change land mid-move without a jump.
 */
export function flipOffset(was: Point | undefined, layout: Point, epsilon = 0.5): Point | null {
  if (!was) return null;
  const x = was.x - layout.x;
  const y = was.y - layout.y;
  return Math.abs(x) < epsilon && Math.abs(y) < epsilon ? null : { x, y };
}
