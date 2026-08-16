import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui";
import styles from "./match.module.scss";

/**
 * Skeleton for `/match`. Reuses the page's own `.page` class rather
 * than a parallel one, so the gutters, max-width and safe-area insets
 * are the same rules and not a copy that drifts.
 *
 * **In a route group so it does not cascade.** A `loading.tsx` wraps
 * its whole subtree, and `/match` has four children — new, join, the
 * live room and the result — none of which look anything like this.
 * Sitting one level up, these two measured cards flashed as the
 * skeleton for all of them; the result page in particular showed a
 * tall "start and join" block and then collapsed. `(landing)` is not
 * in the URL and exists only to stop that.
 *
 * **The active-match banner is deliberately absent.** It renders only
 * when you're mid-match, which is the rarer state — reserving its
 * height would push the whole page down for everyone else and then
 * snap up. Rendering it for the people who do have one costs them a
 * shift the size of one banner; leaving it out costs everyone else
 * nothing, so it stays out.
 */
export default function MatchLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading matches">
      <PageHeaderSkeleton subtitle />
      <CardSkeleton height="14.5rem" ariaLabel="Loading start and join" />
      <CardSkeleton height="11rem" ariaLabel="Loading recent matches" />
    </main>
  );
}
