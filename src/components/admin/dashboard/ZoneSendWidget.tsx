import { WidgetCard } from "./WidgetCard";
import type { ZoneSendRow } from "@/lib/data/dashboard-queries";
import styles from "./zoneSendWidget.module.scss";

interface Props {
  rows: ZoneSendRow[];
}

/**
 * Stacked bar per route — completed sends in accent vs "got the zone
 * but didn't top" in teal. Reveals which routes are gating climbers at
 * the zone hold. Only routes with a zone are shown.
 */
export function ZoneSendWidget({ rows }: Props) {
  const zoneRoutes = rows.filter((r) => r.has_zone);
  const max = zoneRoutes.reduce(
    (m, r) => Math.max(m, r.send_count + r.zone_only),
    0
  );

  return (
    <WidgetCard
      title="Zone vs send"
      subtitle="Routes where climbers stop at the zone"
      empty={zoneRoutes.length === 0}
      emptyMessage="No zone routes in this set."
    >
      <ul className={styles.list}>
        {zoneRoutes.map((r) => {
          const total = r.send_count + r.zone_only;
          const totalPct = max > 0 ? (total / max) * 100 : 0;
          const sendPortion = total > 0 ? (r.send_count / total) * 100 : 0;
          return (
            <li key={r.route_id} className={styles.row}>
              <span className={styles.number}>{r.number}</span>
              <div className={styles.stackTrack}>
                <div
                  className={styles.stack}
                  style={{ "--total-w": `${totalPct}%` } as React.CSSProperties}
                  aria-label={`Route ${r.number}: ${r.send_count} sends, ${r.zone_only} zone only`}
                >
                  <span
                    className={styles.stackSend}
                    style={{ "--part-w": `${sendPortion}%` } as React.CSSProperties}
                  />
                  <span className={styles.stackZone} />
                </div>
              </div>
              <span className={styles.counts}>
                <span className={styles.sendCount}>{r.send_count}</span>
                <span className={styles.separator}>·</span>
                <span className={styles.zoneCount}>{r.zone_only}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <footer className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchSend}`} aria-hidden />
          Send
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchZone}`} aria-hidden />
          Zone only
        </span>
      </footer>
    </WidgetCard>
  );
}
