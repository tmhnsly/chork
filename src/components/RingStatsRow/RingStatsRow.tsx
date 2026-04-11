import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import styles from "./ringStatsRow.module.scss";

interface Props {
  completions: number;
  flashes: number;
  points: number;
  /** Total routes - needed for completion ring. Omit for all-time. */
  totalRoutes?: number;
  /** Max possible points (all flashes + all zones). Omit for all-time. */
  maxPoints?: number;
  /** Ring size in px */
  size?: number;
}

/**
 * Shared ring + stat row used on both the Wall page (StatsWidget)
 * and the profile page (ClimberStats). Single source of truth for
 * ring colours, stat labels, and layout.
 *
 * Three rings when maxPoints is known (current set):
 *   Outer: sends completion rate (accent/lime)
 *   Middle: flash rate (amber)
 *   Inner: score rate (mono - points / max possible)
 *
 * Two rings when maxPoints is unknown (all-time):
 *   Outer: sends (no rate, just decorative fill)
 *   Inner: flashes
 */
export function RingStatsRow({ completions, flashes, points, totalRoutes, maxPoints, size = 56 }: Props) {
  const completionRate = totalRoutes ? completions / totalRoutes : 0;
  const flashRate = completions > 0 ? flashes / completions : 0;
  const scoreRate = maxPoints ? points / maxPoints : 0;

  const rings = [
    { value: completionRate, color: "var(--brand)" },
    { value: flashRate, color: "var(--flash-solid)" },
  ];

  // Only show score ring when we have a known max (current set context)
  if (maxPoints) {
    rings.push({ value: scoreRate, color: "var(--success-solid)" });
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
          <span className={`${styles.label} ${styles.pointsLabel}`}>POINTS</span>
          <span className={`${styles.value} ${styles.points}`}>
            {points}{maxPoints != null && <small>/{maxPoints}</small>}
          </span>
        </div>
      </div>
    </div>
  );
}
