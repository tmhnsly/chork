import { shimmerStyles } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./sendGrid.module.scss";
import widgetStyles from "@/components/StatsWidget/statsWidget.module.scss";

/**
 * Loading skeleton for the send grid page.
 * Static text renders immediately; only dynamic data shimmers.
 */
export function SendGridSkeleton() {
  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Send Grid</h2>

      {/* Stats widget skeleton */}
      <div className={`${widgetStyles.widget} ${shimmerStyles.skeleton}`}>
        <div style={{ width: 88, height: 88 }} />
        <div className={widgetStyles.stats}>
          <div className={widgetStyles.stat}>
            <span className={widgetStyles.value}>&nbsp;</span>
            <span className={widgetStyles.label}>SENDS</span>
          </div>
          <div className={widgetStyles.stat}>
            <span className={widgetStyles.value}>&nbsp;</span>
            <span className={widgetStyles.label}>FLASHES</span>
          </div>
          <div className={widgetStyles.stat}>
            <span className={widgetStyles.value}>&nbsp;</span>
            <span className={widgetStyles.label}>POINTS</span>
          </div>
          <div className={widgetStyles.stat}>
            <span className={widgetStyles.value}>&nbsp;</span>
            <span className={widgetStyles.label}>RESET</span>
          </div>
        </div>
      </div>

      <footer className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.swatchCompleted}`} />
          Completed
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.swatchFlash}`} />
          Flash
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.swatchAttempted}`} />
          Attempted
        </span>
      </footer>

      <div className={styles.tileGrid}>
        {Array.from({ length: 14 }, (_, i) => (
          <PunchTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>
    </div>
  );
}
