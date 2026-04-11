/**
 * Generate a deterministic scattered order for staggered animations.
 * Returns an array where index = item position, value = entrance order.
 * Uses a simple hash-based shuffle so the order is consistent across renders.
 */
export function scatteredOrder(count: number, seed = 0): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = ((seed + i * 2654435761) >>> 0) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}
