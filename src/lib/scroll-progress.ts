/**
 * How far through its pin a scroll-driven section is.
 *
 * A pinned section is a tall block whose sticky child holds the
 * viewport while the block scrolls underneath. Its progress is 0 the
 * moment the block's top reaches the viewport top and 1 the moment
 * its bottom reaches the viewport bottom — the sticky child is
 * pinned for exactly that travel, so this is the only number a
 * section needs.
 *
 * @param top      the block's `getBoundingClientRect().top`
 * @param height   the block's height
 * @param viewport the viewport height
 */
export function pinProgress(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return top < 0 ? 1 : 0;
  return clamp(-top / travel, 0, 1);
}

/** Which of `steps` states a progress maps to, evenly, the last held to the end. */
export function stepAt(progress: number, steps: number): number {
  if (steps <= 1) return 0;
  return Math.min(steps - 1, Math.floor(clamp(progress, 0, 1) * steps));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
