import { shimmerStyles } from "@/components/ui";
import styles from "./matchHistoryList.module.scss";

/** One `MatchHistoryList` row, waiting — its own stylesheet, so its own height. */
export function MatchHistoryRowSkeleton() {
  return (
    <div className={styles.row} aria-hidden>
      <div className={styles.body}>
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "8rem" } as React.CSSProperties} />
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "6rem" } as React.CSSProperties} />
      </div>
      <div className={styles.result}>
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "3rem" } as React.CSSProperties} />
      </div>
    </div>
  );
}
