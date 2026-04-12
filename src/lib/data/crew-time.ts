/**
 * Privacy-first relative timestamp formatter.
 *
 * The crew feature deliberately shows only whole-day resolution on the
 * activity feed so climbers can't infer when their crew-mates are
 * physically at the gym. Never shows clock time, hours, or minutes.
 *
 * Returns one of:
 *   • "today"
 *   • "yesterday"
 *   • "N days ago" for 2..30
 *   • "over a month ago" beyond 30 days
 *
 * Accepts an `at` parameter for tests so the clock can be pinned.
 */
export function relativeDay(iso: string, at: Date = new Date()): string {
  const then = new Date(iso);
  const thenDay = Date.UTC(
    then.getUTCFullYear(),
    then.getUTCMonth(),
    then.getUTCDate()
  );
  const nowDay = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate()
  );
  const diffDays = Math.round((nowDay - thenDay) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 30) return `${diffDays} days ago`;
  return "over a month ago";
}
