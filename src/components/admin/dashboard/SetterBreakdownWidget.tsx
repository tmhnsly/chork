import { WidgetCard } from "./WidgetCard";
import type { SetterBreakdownRow } from "@/lib/data/dashboard-queries";
import styles from "./setterBreakdownWidget.module.scss";

interface Props {
  rows: SetterBreakdownRow[];
}

/**
 * Per-setter engagement summary. Only rendered when any route in the
 * set has a `setter_name` attached — for gyms that don't track setter
 * authorship the entire card stays hidden (see AdminDashboard).
 *
 * Shows route count, total sends, and flash rate per setter — helps
 * gym admins spot which setter's lines climbers are engaging with most.
 * Keeps the rule from the spec: this is about route authorship, NOT
 * the setter's own climbing performance.
 */
export function SetterBreakdownWidget({ rows }: Props) {
  const maxSends = rows.reduce((m, r) => Math.max(m, r.total_sends), 0);

  return (
    <WidgetCard
      title="Setters"
      subtitle="Routes per setter + engagement"
      empty={rows.length === 0}
      emptyMessage="No setter names on this set."
    >
      <ul className={styles.list}>
        {rows.map((row) => {
          const pct = maxSends > 0 ? (row.total_sends / maxSends) * 100 : 0;
          return (
            <li key={row.setter_name} className={styles.row}>
              <div className={styles.header}>
                <span className={styles.name}>{row.setter_name}</span>
                <span className={styles.routes}>
                  {row.route_count} route{row.route_count === 1 ? "" : "s"}
                </span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ "--bar-w": `${pct}%` } as React.CSSProperties}
                  aria-hidden
                />
              </div>
              <div className={styles.stats}>
                <span className={styles.statValue}>
                  {row.total_sends} <span className={styles.statLabel}>sends</span>
                </span>
                <span className={styles.separator}>·</span>
                <span className={styles.statValue}>
                  {row.flash_rate === null ? "—" : `${row.flash_rate.toFixed(0)}%`}
                  <span className={styles.statLabel}>flash</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
