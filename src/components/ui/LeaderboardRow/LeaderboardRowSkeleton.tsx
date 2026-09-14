import { shimmerStyles } from "@/components/ui/Shimmer";
import styles from "./leaderboardRow.module.scss";

/**
 * `LeaderboardRow`, waiting: rank, a disc for the face, two bars for
 * the handle and name, a bar for the points — the row's own
 * stylesheet, so it is exactly one row tall.
 */
export function LeaderboardRowSkeleton({ rank }: { rank?: number }) {
  return (
    <div className={styles.row} aria-hidden>
      <span className={styles.rank}>{rank ?? ""}</span>
      <span className={shimmerStyles.skeletonDisc} />
      <div className={styles.identity}>
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "7rem" } as React.CSSProperties} />
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "5rem" } as React.CSSProperties} />
      </div>
      <div className={styles.stats}>
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "2rem" } as React.CSSProperties} />
      </div>
    </div>
  );
}
