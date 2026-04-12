import { shimmerStyles } from "@/components/ui";
import {
  PODIUM_AVATAR_SIZE_FIRST,
  PODIUM_AVATAR_SIZE_RUNNER_UP,
} from "@/components/Leaderboard/podium-constants";
import styles from "./loading.module.scss";

/**
 * Skeleton for /leaderboard. Mirrors the real layout exactly so there's
 * zero visible shift when the server data arrives:
 *   header → gym stats strip → segment → podium → rows → scoring → invite.
 */
export default function LeaderboardLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading Chorkboard">
      {/* Header */}
      <header className={styles.header}>
        <div className={`${styles.title} ${shimmerStyles.skeleton}`} />
        <div className={`${styles.gym} ${shimmerStyles.skeleton}`} />
      </header>

      {/* Gym stats strip (4 cells) */}
      <div className={styles.statsStrip}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.statsCell}>
            <div className={`${styles.statValue} ${shimmerStyles.skeleton}`} />
            <div className={`${styles.statLabel} ${shimmerStyles.skeleton}`} />
          </div>
        ))}
      </div>

      {/* Segment control */}
      <div className={`${styles.segment} ${shimmerStyles.skeleton}`} />

      {/* Podium — 2nd | 1st | 3rd. Avatar sizes come from the shared
          podium-constants module so the skeleton and real component can't
          drift, and the sizes are applied via inline style (no magic
          pixel values in the stylesheet). */}
      <div className={styles.podium}>
        <div className={styles.podiumSlot}>
          <div
            className={`${styles.avatarPlaceholder} ${shimmerStyles.skeleton}`}
            style={{ width: PODIUM_AVATAR_SIZE_RUNNER_UP, height: PODIUM_AVATAR_SIZE_RUNNER_UP }}
          />
          <div className={`${styles.smallLine} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.smallLine} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.plinth} ${styles.plinth2} ${shimmerStyles.skeleton}`} />
        </div>
        <div className={styles.podiumSlot}>
          <div
            className={`${styles.avatarPlaceholder} ${shimmerStyles.skeleton}`}
            style={{ width: PODIUM_AVATAR_SIZE_FIRST, height: PODIUM_AVATAR_SIZE_FIRST }}
          />
          <div className={`${styles.smallLine} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.smallLine} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.plinth} ${styles.plinth1} ${shimmerStyles.skeleton}`} />
        </div>
        <div className={styles.podiumSlot}>
          <div
            className={`${styles.avatarPlaceholder} ${shimmerStyles.skeleton}`}
            style={{ width: PODIUM_AVATAR_SIZE_RUNNER_UP, height: PODIUM_AVATAR_SIZE_RUNNER_UP }}
          />
          <div className={`${styles.smallLine} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.smallLine} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.plinth} ${styles.plinth3} ${shimmerStyles.skeleton}`} />
        </div>
      </div>

      {/* Top rows */}
      <div className={styles.rows}>
        {[0, 1].map((i) => (
          <div key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
        ))}
      </div>

      {/* Scoring + invite */}
      <div className={`${styles.card} ${shimmerStyles.skeleton}`} />
      <div className={`${styles.inviteCard} ${shimmerStyles.skeleton}`} />
    </main>
  );
}
