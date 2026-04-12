import { WidgetCard } from "./WidgetCard";
import type { CompetitionVenueStats } from "@/lib/data/competition-queries";
import styles from "./venueStatsWidget.module.scss";

interface Props {
  venues: CompetitionVenueStats[];
}

/**
 * Cross-gym widget for the competition organiser. One row per
 * participating gym with its active-climber count, send count, and
 * flash count. Send totals drive the ordering so high-engagement
 * venues surface first.
 */
export function VenueStatsWidget({ venues }: Props) {
  const maxSends = venues.reduce((m, v) => Math.max(m, v.total_sends), 0);

  return (
    <WidgetCard
      title="Venues"
      subtitle="Activity per participating gym"
      empty={venues.length === 0}
      emptyMessage="No gyms linked to this competition yet."
    >
      <ul className={styles.list}>
        {venues.map((v) => {
          const pct = maxSends > 0 ? (v.total_sends / maxSends) * 100 : 0;
          return (
            <li key={v.gym_id} className={styles.row}>
              <div className={styles.headerRow}>
                <span className={styles.name}>{v.gym_name}</span>
                <span className={styles.climbers}>
                  {v.active_climber_count} climber{v.active_climber_count === 1 ? "" : "s"}
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
                <span className={styles.sends}>
                  {v.total_sends} <span className={styles.label}>sends</span>
                </span>
                <span className={styles.separator}>·</span>
                <span className={styles.flashes}>
                  {v.total_flashes} <span className={styles.label}>flashes</span>
                </span>
                <span className={styles.separator}>·</span>
                <span className={styles.sets}>
                  {v.set_count} <span className={styles.label}>set{v.set_count === 1 ? "" : "s"}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
