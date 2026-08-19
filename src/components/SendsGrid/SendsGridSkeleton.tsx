import { shimmerStyles, Legend } from "@/components/ui";
import { StatsWidgetSkeleton } from "@/components/ui/StatsWidget/StatsWidgetSkeleton";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import styles from "./sendsGrid.module.scss";

const PLACEHOLDER_COUNT = 14;

/**
 * Loading skeleton for the wall page.
 *
 * Stats widget: `StatsWidgetSkeleton` — the real card shell with
 * zero data under one shimmer, so its height matches the hydrated
 * widget at every width. Shared with the profile, which loads the
 * same card.
 *
 * Tile grid: real `SendGridTile` placeholders each get a shimmer class
 * for the same height-matching reason.
 */
export function SendsGridSkeleton() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading card">
      {/* The rank strip sits above the card on the real screen, so it
          has to sit above it here too — otherwise the whole page
          jumps down by a row the moment the data lands. */}
      <div className={`${styles.rankStrip} ${shimmerStyles.skeleton}`} />
      <StatsWidgetSkeleton />

      <Legend />

      <div className={styles.tileGrid}>
        {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
          <SendGridTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>
    </div>
  );
}
