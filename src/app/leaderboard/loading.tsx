import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui";
import styles from "./loading.module.scss";

/**
 * Skeleton for /leaderboard. Each section collapses to a single card-
 * shaped block — less visible pop when the server data arrives, and
 * anything that isn't literally a card in the real layout (segment,
 * podium) still reads as one while loading.
 */
export default function LeaderboardLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading Chorkboard">
      <PageHeaderSkeleton />

      <CardSkeleton height="7rem" ariaLabel="Loading gym stats" />
      <CardSkeleton height="3rem" ariaLabel="Loading filter" />
      {/* One block for the board (podium + standings), named as the
          shared element so the Card page's rank strip morphs into it
          before the real board arrives. */}
      <div data-vt="board">
        <CardSkeleton height="22rem" ariaLabel="Loading the board" />
      </div>
      <CardSkeleton height="10rem" ariaLabel="Loading scoring breakdown" />
      <CardSkeleton height="8rem" ariaLabel="Loading invite card" />
    </main>
  );
}
