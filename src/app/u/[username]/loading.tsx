import { shimmerStyles } from "@/components/ui";
import styles from "./loading.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page}>
      {/* Profile header */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={`${styles.lineUsername} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.lineName} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.lineCounts} ${shimmerStyles.skeleton}`} />
        </div>
        <div className={`${styles.avatar} ${shimmerStyles.skeleton}`} />
      </header>

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

      {/* Current set card */}
      <div className={`${styles.currentSetCard} ${shimmerStyles.skeleton}`} />

      {/* Badges */}
      <div className={styles.badgeRow}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${styles.badge} ${shimmerStyles.skeleton}`} />
        ))}
      </div>
    </main>
  );
}
