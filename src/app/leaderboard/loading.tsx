import { shimmerStyles } from "@/components/ui";
import styles from "./loading.module.scss";

export default function LeaderboardLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading leaderboard">
      {/* Header */}
      <header className={styles.header}>
        <div className={`${styles.title} ${shimmerStyles.skeleton}`} />
        <div className={`${styles.gym} ${shimmerStyles.skeleton}`} />
      </header>

      {/* Segment control */}
      <div className={`${styles.segment} ${shimmerStyles.skeleton}`} />

      {/* Podium */}
      <div className={styles.podium}>
        <div className={`${styles.plinth} ${styles.plinth2} ${shimmerStyles.skeleton}`} />
        <div className={`${styles.plinth} ${styles.plinth1} ${shimmerStyles.skeleton}`} />
        <div className={`${styles.plinth} ${styles.plinth3} ${shimmerStyles.skeleton}`} />
      </div>

      {/* Top rows */}
      <div className={styles.rows}>
        {[0, 1].map((i) => (
          <div key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
        ))}
      </div>
    </main>
  );
}
