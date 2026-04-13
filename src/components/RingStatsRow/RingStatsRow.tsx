import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import styles from "./ringStatsRow.module.scss";

interface Props {
  completions: number;
  flashes: number;
  zones: number;
  points: number;
  /** Total routes. Omit to render the sends ring as a full decorative fill. */
  totalRoutes?: number;
  /**
   * Number of completed routes that have a zone. Used as the zones-ring
   * denominator so zone rate = zones / zoneCompletions. Omit to hide
   * the zones ring (renders 2 rings only).
   */
  zoneCompletions?: number;
  /** Ring size in px */
  size?: number;
}

/**
 * Shared ring + stat row used on the wall (StatsWidget) and on
 * profile pages (ClimberStats). Rings are consistent across contexts:
 *
 *   Outer:  sends completion rate (completions / totalRoutes). Full
 *           decorative fill if no total is known.
 *   Middle: flash rate (flashes / completions)
 *   Inner:  zone rate (zones / zoneCompletions)
 *
 * Points is surfaced as a mono stat on the right, not a ring — score
 * totals are context that belongs next to the other counts, not
 * competing with rates for the "hero" ring slot.
 */
export function RingStatsRow({
  completions,
  flashes,
  zones,
  points,
  totalRoutes,
  zoneCompletions,
  size = 72,
}: Props) {
  const completionRate = totalRoutes ? completions / totalRoutes : 1;
  const flashRate = completions > 0 ? flashes / completions : 0;
  const zoneRate = zoneCompletions && zoneCompletions > 0 ? zones / zoneCompletions : 0;

  const rings = [
    { value: completionRate, color: "var(--brand)" },
    { value: flashRate, color: "var(--flash-solid)" },
  ];
  if (zoneCompletions != null) {
    rings.push({ value: zoneRate, color: "var(--success-solid)" });
  }

  return (
    <div className={styles.row}>
      <ActivityRings rings={rings} size={size} />
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={`${styles.label} ${styles.accentLabel}`}>SENDS</span>
          <span className={`${styles.value} ${styles.accent}`}>
            {completions}{totalRoutes != null && <small>/{totalRoutes}</small>}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.label} ${styles.flashLabel}`}>FLASHES</span>
          <span className={`${styles.value} ${styles.flash}`}>
            {flashes}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.label} ${styles.zoneLabel}`}>ZONES</span>
          <span className={`${styles.value} ${styles.zone}`}>
            {zones}
          </span>
        </div>
      </div>
      <div className={styles.points}>
        <span className={styles.pointsValue}>{points}</span>
        <span className={styles.pointsLabel}>PTS</span>
      </div>
    </div>
  );
}
