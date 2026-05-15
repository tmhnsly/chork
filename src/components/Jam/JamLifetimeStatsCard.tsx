import { FaBolt, FaCrown, FaFire } from "react-icons/fa6";
import { SectionCard } from "@/components/ui/SectionCard";
import type { JamLifetimeStats } from "@/lib/data/jam-stats";
import styles from "./jamLifetimeStatsCard.module.scss";

const EM_DASH = "—";

interface Props {
  stats: JamLifetimeStats;
  /**
   * When true, the card is being viewed by the climber themselves —
   * mirrors the wall's `isOwnProfile` so we can later differentiate
   * private vs public stats. For now both views render the same;
   * the prop is here so we don't have to thread it later if we add
   * an owner-only stat.
   */
  isOwnProfile?: boolean;
}

/**
 * Lifetime jam aggregate card on /u/[username]. Sister to the gym's
 * "All Time" card — same surface, same shape — so a climber with no
 * gym still has a meaningful stats display from jam play alone.
 *
 * Jam stats deliberately stay separate from gym stats (no combined
 * "total points" number). Jams shouldn't influence gym leaderboards
 * and vice versa, so a single composite stat would mislead.
 */
export function JamLifetimeStatsCard({ stats }: Props) {
  // Render nothing when the climber has played zero jams — keeps the
  // profile quiet for first-time visitors. ProfileJamsSection already
  // returns null in this case, but the card is safe to use elsewhere.
  if (stats.jamsPlayed === 0) return null;

  const finishLabel =
    stats.bestFinish === null
      ? EM_DASH
      : stats.bestFinish === 1
        ? "1st"
        : stats.bestFinish === 2
          ? "2nd"
          : stats.bestFinish === 3
            ? "3rd"
            : `${stats.bestFinish}th`;

  return (
    <SectionCard title="Jam lifetime" icon={<FaFire />}>
      <div className={styles.header}>
        <div className={styles.headerStat}>
          <span className={styles.headerValue}>{stats.jamsPlayed}</span>
          <span className={styles.headerLabel}>
            {stats.jamsPlayed === 1 ? "Jam played" : "Jams played"}
          </span>
        </div>
        {stats.jamsWon > 0 && (
          <div className={styles.headerStat}>
            <span className={`${styles.headerValue} ${styles.accent}`}>
              <FaCrown aria-hidden /> {stats.jamsWon}
            </span>
            <span className={styles.headerLabel}>
              {stats.jamsWon === 1 ? "Win" : "Wins"}
            </span>
          </div>
        )}
        <div className={styles.headerStat}>
          <span className={styles.headerValue}>{finishLabel}</span>
          <span className={styles.headerLabel}>Best finish</span>
        </div>
      </div>

      <div className={styles.grid}>
        <Cell label="Total sends" value={stats.totalSends} />
        <Cell
          label="Flashes"
          value={stats.totalFlashes}
          icon={<FaBolt aria-hidden />}
          emphasis="flash"
        />
        <Cell label="Total points" value={stats.totalPoints} />
        <Cell
          label="Flash rate"
          value={
            stats.flashRate === null
              ? EM_DASH
              : `${Math.round(stats.flashRate * 100)}%`
          }
          emphasis="flash"
        />
        <Cell
          label="Pts / jam"
          value={stats.pointsPerJam === null ? EM_DASH : stats.pointsPerJam.toFixed(1)}
        />
      </div>
    </SectionCard>
  );
}

interface CellProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  emphasis?: "flash";
}

function Cell({ label, value, icon, emphasis }: CellProps) {
  return (
    <div className={styles.cell}>
      <span
        className={`${styles.cellValue} ${emphasis === "flash" ? styles.flashValue : ""}`}
      >
        {icon}
        {value}
      </span>
      <span className={styles.cellLabel}>{label}</span>
    </div>
  );
}
