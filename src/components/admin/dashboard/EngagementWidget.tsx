import { WidgetCard } from "./WidgetCard";
import type { EngagementPoint } from "@/lib/data/dashboard-queries";
import styles from "./engagementWidget.module.scss";

interface Props {
  points: EngagementPoint[];
  activeCount: number;
}

/**
 * Climber engagement — big number for this set, sparkline of active
 * climbers across the last N sets. Pure CSS sparkline (no chart lib)
 * so the dashboard bundle stays lean.
 */
export function EngagementWidget({ points, activeCount }: Props) {
  const max = points.reduce((m, p) => Math.max(m, p.active_climber_count), 0);

  return (
    <WidgetCard
      title="Climber engagement"
      subtitle="Active climbers this set + last runs"
      empty={points.length === 0 && activeCount === 0}
    >
      <div className={styles.layout}>
        <div className={styles.stat}>
          <span className={styles.value}>{activeCount}</span>
          <span className={styles.label}>active this set</span>
        </div>

        {points.length > 1 && (
          <div className={styles.sparkWrap} aria-label="Engagement trend across recent sets">
            {points.map((p) => {
              const h = max === 0 ? 0 : (p.active_climber_count / max) * 100;
              return (
                <div
                  key={p.set_id}
                  className={styles.sparkBar}
                  style={{ "--bar-h": `${h}%` } as React.CSSProperties}
                  title={`${p.active_climber_count} climbers`}
                  aria-hidden
                />
              );
            })}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
