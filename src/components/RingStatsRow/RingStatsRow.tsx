import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import { BrandDivider } from "@/components/ui/BrandDivider";
import { CountUpNumber } from "@/components/CountUpNumber/CountUpNumber";
import { shimmerStyles } from "@/components/ui";
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
  /**
   * Max points achievable on this scope (all-flash + all-zone). When
   * provided, the points total renders as `N · M` with the shared
   * BrandDivider between — the climber sees both their score and the
   * ceiling it's sitting against.
   */
  maxPoints?: number;
  /**
   * Leaderboard placement for this scope (optional). Rendered next to
   * the points total on the right — replaces the old rank badge that
   * used to live in a separate header slot on profile / set-detail.
   */
  rank?: number | null;
  /**
   * When true, reserve the Place cell's layout space and render a
   * shimmer instead of the rank number. Prevents the pop-in that
   * otherwise happens when rank is fetched client-side (e.g. the
   * previous-sets drawer). Ignored when `rank` resolves to a number.
   */
  rankLoading?: boolean;
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
  maxPoints,
  rank,
  rankLoading = false,
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
            <CountUpNumber value={completions} />
            {totalRoutes != null && <small>/{totalRoutes}</small>}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.label} ${styles.flashLabel}`}>FLASHES</span>
          <span className={`${styles.value} ${styles.flash}`}>
            <CountUpNumber value={flashes} />
          </span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.label} ${styles.zoneLabel}`}>ZONES</span>
          <span className={`${styles.value} ${styles.zone}`}>
            <CountUpNumber value={zones} />
          </span>
        </div>
      </div>
      <div className={styles.totals}>
        <div className={styles.totalsCell}>
          <span className={styles.totalsValue}>
            <CountUpNumber value={points} />
            {maxPoints != null && <small>/{maxPoints}</small>}
          </span>
          <span className={styles.totalsLabel}>PTS</span>
        </div>
        {(rank != null || rankLoading) && (
          <>
            <BrandDivider className={styles.totalsSep} variant="bar" />
            <div className={`${styles.totalsCell} ${styles.totalsCellMuted}`}>
              {rank != null ? (
                <span className={styles.totalsValue}>
                  #<CountUpNumber value={rank} />
                </span>
              ) : (
                <span
                  className={`${styles.totalsValue} ${styles.rankLoading} ${shimmerStyles.skeleton}`}
                  aria-label="Loading place"
                />
              )}
              <span className={styles.totalsLabel}>PLACE</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
