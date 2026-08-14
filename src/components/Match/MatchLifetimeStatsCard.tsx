import { FaBolt, FaCrown, FaFire } from "react-icons/fa6";
import { SectionCard } from "@/components/ui/SectionCard";
import type { MatchLifetimeStats } from "@/lib/data/match-stats";
import styles from "./matchLifetimeStatsCard.module.scss";

const EM_DASH = "—";

interface Props {
  stats: MatchLifetimeStats;
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
 * Lifetime match aggregate card on /u/[username]. Sister to the gym's
 * "All Time" card — same surface, same shape — so a climber with no
 * gym still has a meaningful stats display from match play alone.
 *
 * Match stats deliberately stay separate from gym stats (no combined
 * "total points" number). Matches shouldn't influence gym leaderboards
 * and vice versa, so a single composite stat would mislead.
 */
export function MatchLifetimeStatsCard({ stats }: Props) {
  // Render nothing when the climber has played zero matches — keeps the
  // profile quiet for first-time visitors. ProfileMatchesSection already
  // returns null in this case, but the card is safe to use elsewhere.
  if (stats.matchesPlayed === 0) return null;

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
    <SectionCard title="Match lifetime" icon={<FaFire />}>
      <div className={styles.header}>
        <div className={styles.headerStat}>
          <span className={styles.headerValue}>{stats.matchesPlayed}</span>
          <span className={styles.headerLabel}>
            {stats.matchesPlayed === 1 ? "Match played" : "Matches played"}
          </span>
        </div>
        {stats.matchesWon > 0 && (
          <div className={styles.headerStat}>
            <span className={`${styles.headerValue} ${styles.accent}`}>
              <FaCrown aria-hidden /> {stats.matchesWon}
            </span>
            <span className={styles.headerLabel}>
              {stats.matchesWon === 1 ? "Win" : "Wins"}
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
          label="Pts / match"
          value={stats.pointsPerMatch === null ? EM_DASH : stats.pointsPerMatch.toFixed(1)}
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
