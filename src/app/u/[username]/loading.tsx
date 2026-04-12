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

      {/* Stats — mirrors ClimberStats wrapper */}
      <div className={styles.statsWrapper}>
        {/* All Time card */}
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
          <div className={`${styles.allTimeTag} ${shimmerStyles.skeleton}`} />
        </div>

        {/* Current Set label + card */}
        <div className={`${styles.sectionLabel} ${shimmerStyles.skeleton}`} style={{ width: "6rem", height: "var(--text-xs)" }} />
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

      {/* Achievements */}
      <div className={styles.badgeSection}>
        <div className={`${styles.sectionLabel} ${shimmerStyles.skeleton}`} style={{ width: "8rem", height: "var(--text-xs)" }} />
        <div className={styles.badgeRow}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${styles.badge} ${shimmerStyles.skeleton}`} />
          ))}
        </div>
      </div>
    </main>
  );
}
