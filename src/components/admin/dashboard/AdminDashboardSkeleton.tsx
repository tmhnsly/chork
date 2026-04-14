import { CardSkeleton } from "@/components/ui/CardSkeleton";
import styles from "./adminDashboard.module.scss";

/**
 * Skeleton shape for the admin dashboard — placeholder used by the
 * Suspense boundary on /admin while widget RPCs stream in. Matches
 * the real grid shape so the layout doesn't shift when data lands.
 */
export function AdminDashboardSkeleton() {
  return (
    <div className={styles.wrapper} aria-busy="true">
      <CardSkeleton height="3rem" ariaLabel="Loading dashboard tabs" />
      <div className={styles.grid}>
        <div className={styles.wide}>
          <CardSkeleton height="11rem" />
        </div>
        <CardSkeleton height="14rem" />
        <CardSkeleton height="14rem" />
        <div className={styles.wide}>
          <CardSkeleton height="18rem" />
        </div>
      </div>
    </div>
  );
}
