import { shimmerStyles } from "@/components/ui/Shimmer";
import styles from "./climberRow.module.scss";

/**
 * `ClimberRow`, waiting: a disc for the face and two bars for the
 * handle and name, on the row's own stylesheet so it is exactly one
 * row tall. No actions — a list that is loading has not decided
 * what you can do to anyone in it yet.
 */
export function ClimberRowSkeleton() {
  return (
    <div className={styles.row} aria-hidden>
      <div className={styles.identity}>
        <span className={shimmerStyles.skeletonDisc} />
        <div className={styles.text}>
          <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "7rem" } as React.CSSProperties} />
          <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "5rem" } as React.CSSProperties} />
        </div>
      </div>
    </div>
  );
}
