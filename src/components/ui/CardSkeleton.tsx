import styles from "./cardSkeleton.module.scss";
import { shimmerStyles } from "./Shimmer";

interface Props {
  /**
   * Approximate height of the real card this stands in for. Match the
   * tallest expected state so the surrounding layout doesn't shift
   * when real data hydrates.
   */
  height?: string;
  /** Screen-reader label describing what's loading. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Single-block card-shaped skeleton. Render one per section instead of
 * reconstructing the real card's inner layout — fewer moving pieces
 * means less visible "pop" as content resolves, and non-card sections
 * (achievements shelf, sets grid) can still look like a card while
 * they load.
 */
export function CardSkeleton({ height = "9rem", ariaLabel = "Loading", className }: Props) {
  return (
    <div
      className={`${styles.card} ${shimmerStyles.skeleton} ${className ?? ""}`}
      style={{ minHeight: height }}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
    />
  );
}
