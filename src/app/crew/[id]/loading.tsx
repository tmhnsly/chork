import { CardSkeleton } from "@/components/ui";
import styles from "./crewDetail.module.scss";

/**
 * Route-level loading boundary for a single crew — the tabbed detail
 * view (Activity / Leaderboard / Members).
 *
 * This route had no boundary of its own, so it inherited `/crew`'s,
 * which described the picker. The two pages have different shapes;
 * each now describes itself.
 */
export default function CrewDetailLoading() {
  return (
    <main
      className={styles.page}
      aria-busy="true"
      aria-label="Loading crew"
    >
      <CardSkeleton height="6rem" ariaLabel="Loading crew header" />
      <CardSkeleton height="12rem" ariaLabel="Loading activity feed" />
    </main>
  );
}
