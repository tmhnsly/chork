import { FaSnowflake } from "react-icons/fa6";
import { WidgetCard } from "./WidgetCard";
import type { TopRouteRow } from "@/lib/data/dashboard-queries";
import styles from "./staleRoutesWidget.module.scss";

interface Props {
  routes: TopRouteRow[];
}

/**
 * Flip-side of TopRoutes — the routes climbers aren't engaging with.
 * Surfaces the bottom of the send distribution so setters know which
 * lines to refresh / re-tag / take down. Shown when there's at least
 * one route with zero sends, otherwise the whole panel hides.
 */
export function StaleRoutesWidget({ routes }: Props) {
  const stale = [...routes]
    .sort((a, b) => a.send_count - b.send_count || a.number - b.number)
    .slice(0, 5);

  const anyZero = stale.some((r) => r.send_count === 0);

  return (
    <WidgetCard
      title="Stale routes"
      subtitle="Lowest engagement — candidates for a refresh"
      icon={<FaSnowflake />}
      empty={!anyZero && stale.length === 0}
      emptyMessage="Every route has sends — no stale routes to flag."
    >
      <ul className={styles.list}>
        {stale.map((route) => (
          <li key={route.route_id} className={styles.row}>
            <span className={styles.number}>{route.number}</span>
            <div className={styles.meta}>
              <span className={styles.primary}>
                {route.send_count} send{route.send_count === 1 ? "" : "s"}
              </span>
              <span className={styles.secondary}>
                {route.attempt_count} attempt{route.attempt_count === 1 ? "" : "s"}
              </span>
            </div>
            {route.send_count === 0 && (
              <span className={styles.flag}>No sends yet</span>
            )}
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
