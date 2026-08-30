/**
 * League scoring — the TS mirror of migration 134's two rules.
 *
 * The table itself is computed in SQL (`league_standings`); these
 * exist for the legend under the table and the one-line copy that
 * explains the drop rule. `league.test.ts` pins them equal to the SQL
 * so a change to one cannot ship alone — the `compute_points`
 * convention.
 */

/** Points by placing, 1st first. Every place past the end pays 1. */
export const LEAGUE_LADDER = [10, 8, 6, 5, 4, 3, 2] as const;

export function placementPoints(rank: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  return LEAGUE_LADDER[rank - 1] ?? 1;
}

/** How many of the League's weeks are dropped from everyone's total. */
export function dropsFor(weeks: number): number {
  if (weeks >= 8) return 2;
  if (weeks >= 4) return 1;
  return 0;
}

export function countingWeeks(weeks: number): number {
  return Math.max(0, weeks - dropsFor(weeks));
}

/** One line under the table saying which rule applies right now. */
export function describeDropRule(weeks: number): string {
  const drops = dropsFor(weeks);
  if (drops === 0) {
    return weeks === 3
      ? "Every week counts. From 4 weeks your lowest is dropped."
      : "Every week counts.";
  }
  const dropped = drops === 1 ? "your lowest week is dropped" : "your lowest two weeks are dropped";
  return `Best ${countingWeeks(weeks)} of ${weeks} count — ${dropped}.`;
}
