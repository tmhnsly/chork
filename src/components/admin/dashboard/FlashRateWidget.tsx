import { FaBolt } from "react-icons/fa6";
import { WidgetCard } from "./WidgetCard";
import type { TopRouteRow } from "@/lib/data/dashboard-queries";
import styles from "./flashRateWidget.module.scss";

interface Props {
  routes: TopRouteRow[];
}

/**
 * Set-wide flash-rate snapshot. One big number with a breakdown per
 * route bucket (10+ sends / 5-9 / 1-4 / 0) so setters see where the
 * flashable lines are clustering without scanning the full top-routes
 * list. Derived from `topRoutes` — no extra query.
 *
 * Hidden when the set has zero sends (nothing to flash).
 */
export function FlashRateWidget({ routes }: Props) {
  const totalSends = routes.reduce((acc, r) => acc + r.send_count, 0);
  const totalFlashes = routes.reduce((acc, r) => acc + r.flash_count, 0);
  const rate = totalSends > 0 ? (totalFlashes / totalSends) * 100 : 0;

  const buckets = [
    { label: "10+ sends", min: 10 },
    { label: "5-9 sends", min: 5 },
    { label: "1-4 sends", min: 1 },
  ].map((bucket) => {
    const matching = routes.filter((r) => {
      const max = bucket.min === 10 ? Infinity : bucket.min === 5 ? 9 : 4;
      return r.send_count >= bucket.min && r.send_count <= max;
    });
    const sends = matching.reduce((a, r) => a + r.send_count, 0);
    const flashes = matching.reduce((a, r) => a + r.flash_count, 0);
    return {
      label: bucket.label,
      count: matching.length,
      rate: sends > 0 ? (flashes / sends) * 100 : null,
    };
  });

  return (
    <WidgetCard
      title="Flash rate"
      subtitle="Set-wide, broken down by route popularity"
      icon={<FaBolt />}
      empty={totalSends === 0}
      emptyMessage="No sends on this set yet."
    >
      <div className={styles.body}>
        <div className={styles.headline}>
          <span className={styles.number}>{rate.toFixed(0)}%</span>
          <span className={styles.meta}>
            {totalFlashes} of {totalSends} sends were flashes
          </span>
        </div>

        <ul className={styles.buckets}>
          {buckets.map((bucket) => (
            <li key={bucket.label} className={styles.bucket}>
              <span className={styles.bucketLabel}>{bucket.label}</span>
              <span className={styles.bucketCount}>
                {bucket.count} route{bucket.count === 1 ? "" : "s"}
              </span>
              <span className={styles.bucketRate}>
                {bucket.rate === null ? "—" : `${bucket.rate.toFixed(0)}%`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </WidgetCard>
  );
}
