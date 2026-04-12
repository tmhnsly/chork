import { shimmerStyles } from "@/components/ui";
import styles from "./crew.module.scss";
import loadingStyles from "./loading.module.scss";

/**
 * Route-level loading boundary for /crew. Next.js wraps the page in
 * a Suspense boundary with this as the fallback, so the tab shell
 * paints instantly on navigation while the server resolves the
 * parallel fan-out of queries in page.tsx.
 *
 * Heights/shapes mirror the real layout: header + pending-invites
 * card (reserved) + feed skeleton rows + leaderboard pills + rows.
 * If the real layout changes, update the shapes here in the same
 * commit so the skeleton stays pixel-adjacent.
 */
export default function CrewLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading crew">
      <header className={styles.header}>
        <div className={`${loadingStyles.title} ${shimmerStyles.skeleton}`} />
        <div className={`${loadingStyles.sub} ${shimmerStyles.skeleton}`} />
      </header>

      {/* Feed rows */}
      <section className={loadingStyles.section}>
        <div className={`${loadingStyles.sectionTitle} ${shimmerStyles.skeleton}`} />
        <ul className={loadingStyles.list}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={`${loadingStyles.feedRow} ${shimmerStyles.skeleton}`} />
          ))}
        </ul>
      </section>

      {/* Leaderboard — crew pills + rows */}
      <section className={loadingStyles.section}>
        <div className={`${loadingStyles.sectionTitle} ${shimmerStyles.skeleton}`} />
        <div className={loadingStyles.pillRow}>
          {[0, 1].map((i) => (
            <div key={i} className={`${loadingStyles.pill} ${shimmerStyles.skeleton}`} />
          ))}
        </div>
        <ul className={loadingStyles.list}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className={`${loadingStyles.leaderboardRow} ${shimmerStyles.skeleton}`} />
          ))}
        </ul>
      </section>
    </main>
  );
}
