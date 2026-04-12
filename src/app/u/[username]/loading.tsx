import { shimmerStyles } from "@/components/ui";
import styles from "./loading.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading profile">
      {/* Profile header */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={`${styles.lineUsername} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.lineName} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.lineCounts} ${shimmerStyles.skeleton}`} />
        </div>
        <div className={`${styles.avatar} ${shimmerStyles.skeleton}`} />
      </header>

      {/* Stats — mirrors ClimberStats layout exactly:
          section label → card, section label → card. */}
      <div className={styles.statsWrapper}>
        {/* All Time */}
        <div className={styles.labelledSection}>
          <span className={styles.sectionLabel}>All Time</span>
          <div className={styles.allTimeCard}>
            <div className={styles.allTimeRow}>
              <div className={`${styles.ringPlaceholder} ${shimmerStyles.skeleton}`} />
              <div className={styles.statsRow}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className={styles.statBlock}>
                    <div className={`${styles.statValue} ${shimmerStyles.skeleton}`} />
                    <div className={`${styles.statLabel} ${shimmerStyles.skeleton}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.extrasGrid}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`${styles.extraCell} ${shimmerStyles.skeleton}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Current Set */}
        <div className={styles.labelledSection}>
          <span className={styles.sectionLabel}>Current Set</span>
          <div className={styles.currentSetCard}>
            <div className={styles.currentSetRow}>
              <div className={`${styles.currentSetRing} ${shimmerStyles.skeleton}`} />
              <div className={styles.statsRow}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className={styles.statBlock}>
                    <div className={`${styles.statValue} ${shimmerStyles.skeleton}`} />
                    <div className={`${styles.statLabel} ${shimmerStyles.skeleton}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className={`${styles.chartPlaceholder} ${shimmerStyles.skeleton}`} />
            <div className={`${styles.chartFooter} ${shimmerStyles.skeleton}`} />
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className={styles.badgeSection}>
        <div className={`${styles.sectionLabel} ${shimmerStyles.skeleton}`} style={{ width: "8rem", height: "var(--text-xs)" }} />
        <div className={styles.badgeRow}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${styles.badge} ${shimmerStyles.skeleton}`} />
          ))}
        </div>
      </div>

      {/* Sets grid */}
      <div className={styles.setsSection}>
        <div className={`${styles.sectionLabel} ${shimmerStyles.skeleton}`} style={{ width: "4rem", height: "var(--text-xs)" }} />
        <div className={styles.setsGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.setTile}>
              <div className={`${styles.setRing} ${shimmerStyles.skeleton}`} />
              <div className={`${styles.setLabel} ${shimmerStyles.skeleton}`} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
