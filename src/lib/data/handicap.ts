import { computePoints } from "./logs";
import type { RouteLog } from "./types";

/**
 * Handicap scoring — an optional lens that lets climbers of different
 * abilities share a board honestly.
 *
 * **Matches only, never gym Sets.** A gym Set carries the gym's name
 * and eventually prizes, so its scoring has to be comparable and
 * ungameable. A handicap is self-declared and inherently soft. See
 * CONTEXT.md.
 *
 * ── Why a multiplier and not a different ladder ──────────────────
 *
 * `computePoints` never reads grade — a V4 and a 6a+ already share
 * one points total with no equivalence to invent, which is what stops
 * every game mode being built three times. Handicap is layered OVER
 * that: base points first, then one multiplier. There is still one
 * scoring ladder.
 *
 * ── Why this shape ───────────────────────────────────────────────
 *
 * A stronger climber doesn't out-score a weaker one by scoring more
 * per route — on a route both can flash, both score 4. They win
 * because they can send routes the other physically cannot, and
 * because their warm-ups are the other climber's projects.
 *
 * So the multiplier peaks at YOUR limit and falls away below it. A V2
 * climber's V2 and a V6 climber's V6 are the same achievement and
 * score the same; the V6 climber's V1 warm-up is worth almost
 * nothing, because it cost them nothing.
 *
 * Sending ABOVE your declared ceiling is capped at full value rather
 * than bonused. A bonus there would make declaring low strictly
 * better than being honest — every hard send would multiply up — and
 * a number everyone games is worse than no number.
 *
 * ── What this does NOT solve ─────────────────────────────────────
 *
 * Ceilings are self-declared, and declaring low is still worth
 * points: your band fills with routes you flash, and a flash is the
 * top of the base ladder. Capping above-ceiling at 1 removes the
 * biggest lever but not the incentive.
 *
 * That is knowingly left, because the fix is a different feature: a
 * ceiling SUGGESTED from what you have actually been sending, which
 * needs history to exist first (docs/roadmap.md). Until then this is
 * a handicap for climbing with mates, where everyone can see what
 * everyone climbed — not a defence against an adversary. Auto-raising
 * the ceiling mid-Match was tried on paper and rejected: it punishes
 * the upset, since a V2 climber who sends a V4 would have their
 * earlier V0 and V1 sends fall out of band and score less for
 * climbing better.
 */

/**
 * How much a send counts, given how far the route sits below the
 * climber's own ceiling.
 *
 * Indexed by `ceiling - routeGrade`: 0 is at your limit, 1 is one
 * grade below, 2 is two. Anything further down counts for nothing.
 *
 * **The cutoff is what makes it balanced**, and it was measured
 * rather than guessed. With any tail at all, a stronger climber
 * out-scores a weaker one on volume — they have more routes below
 * them, so even a token multiplier accumulates. Simulating a session
 * across V0–V6:
 *
 *     taper [1,.7,.4,.2] + floor .1   V2 4.7  V6 6.7   ratio 1.43
 *     taper [1,.7,.4,.15]             V2 4.7  V6 5.3   ratio 1.13
 *     taper [1,.7,.4] cutoff          V2 4.7  V6 4.7   ratio 1.00
 *
 * So: only routes within two grades of your limit count. That is a
 * rule you can say out loud, and it makes every climber's board
 * position about how well they climbed rather than how hard they
 * climb. A strong climber's warm-ups score nothing — which is the
 * point, because they cost nothing.
 */
const TAPER = [1, 0.7, 0.4] as const;
const OUT_OF_BAND = 0;

/**
 * Multiplier for one send. `1` means full value.
 *
 * At or above the ceiling returns 1 — never more. See the note above
 * on why there is no above-ceiling bonus.
 */
export function handicapMultiplier(
  routeGrade: number,
  ceiling: number,
): number {
  const below = ceiling - routeGrade;
  if (below <= 0) return 1;
  return TAPER[below] ?? OUT_OF_BAND;
}

/**
 * Handicapped points for one send, in TENTHS of a point.
 *
 * Integer tenths rather than a float so totals sum exactly — a board
 * that disagrees with itself by 0.30000000000000004 is a bug report
 * waiting to happen. Divide by 10 at display.
 *
 * Falls back to plain base points (×10) when the handicap can't
 * apply: an ungraded route, or a climber who hasn't declared a
 * ceiling. Silently scoring them zero would be worse than scoring
 * them un-handicapped.
 */
export function handicapPointsTenths(
  log: Pick<RouteLog, "attempts" | "completed" | "zone">,
  routeGrade: number | null,
  ceiling: number | null,
): number {
  const base = computePoints(log);
  if (routeGrade === null || ceiling === null) return base * 10;
  return Math.round(base * handicapMultiplier(routeGrade, ceiling) * 10);
}

/** Points as a display number, e.g. `12.4`. */
export function tenthsToPoints(tenths: number): number {
  return Math.round(tenths) / 10;
}

/**
 * Format a handicapped total for the board.
 *
 * Whole numbers render without a trailing `.0` — "12" reads better
 * than "12.0" in a leaderboard column, and the decimal only earns its
 * place when it's carrying information.
 */
export function formatHandicapPoints(tenths: number): string {
  const points = tenthsToPoints(tenths);
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}
