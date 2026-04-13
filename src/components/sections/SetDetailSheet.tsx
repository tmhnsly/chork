"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { shimmerStyles } from "@/components/ui";
import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import { ICON_MAP as BADGE_ICONS } from "@/components/BadgeShelf/BadgeShelf";
import { pointsPerSend } from "@/lib/data/profile-stats";
import type { RouteLog } from "@/lib/data";
import { fetchSetPlacement } from "@/app/u/[username]/actions";
import type { SetCell } from "./PreviousSetsGrid";
import styles from "./setDetailSheet.module.scss";

const EM_DASH = "\u2014";

interface Props {
  set: SetCell;
  gymId: string;
  userId: string;
  onClose: () => void;
}

export function SetDetailSheet({ set, userId, onClose }: Props) {
  const [rank, setRank] = useState<number | null>(null);
  const [rankLoading, setRankLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSetPlacement(userId, set.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setRankLoading(false);
        return;
      }
      setRank(result.rank);
      setRankLoading(false);
    });
    return () => { cancelled = true; };
  }, [set.id, userId]);

  const pps = pointsPerSend(set.points, set.completions);
  const flashRate = set.completions > 0 ? set.flashes / set.completions : null;
  const completionRate = set.totalRoutes > 0 ? set.completions / set.totalRoutes : null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={set.label}
      description={`Stats for ${set.label}`}
    >
      <div className={styles.body}>
        {/* Header — label + rank badge */}
        <header className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.label}>{set.label}</span>
            {set.isActive && <span className={styles.activeTag}>Current set</span>}
          </div>
          {rankLoading ? (
            <div className={`${styles.rankBadgeSkeleton} ${shimmerStyles.skeleton}`} />
          ) : rank !== null ? (
            <span className={styles.rankBadge} aria-label={`Rank ${rank}`}>#{rank}</span>
          ) : null}
        </header>

        {/* Ring stats */}
        <RingStatsRow
          completions={set.completions}
          flashes={set.flashes}
          zones={set.zones}
          points={set.points}
          totalRoutes={set.totalRoutes}
          zoneCompletions={set.routes.reduce(
            (n, r) => (r.has_zone && set.logs.get(r.id)?.completed ? n + 1 : n),
            0,
          )}
          size={72}
        />

        {/* Secondary stats — Total pts already reads on the RingStatsRow
            to the right of the wheel, so the third cell here surfaces a
            rate metric (completion %) instead of repeating the number. */}
        <div className={styles.stats}>
          <Stat label="Pts / send" value={pps === null ? EM_DASH : pps.toFixed(1)} />
          <Stat
            label="Flash rate"
            value={flashRate === null ? EM_DASH : `${Math.round(flashRate * 100)}%`}
          />
          <Stat
            label="Completion"
            value={completionRate === null ? EM_DASH : `${Math.round(completionRate * 100)}%`}
          />
        </div>

        {/* Route chart */}
        {set.routes.length > 0 && (
          <div className={styles.chartBlock}>
            <RouteChart
              logs={set.logs as unknown as Map<string, RouteLog>}
              routeIds={set.routes.map((r) => r.id)}
              routeHasZone={set.routes.map((r) => r.has_zone)}
              routeNumbers={set.routes.map((r) => r.number)}
            />
            <div className={styles.chartFooter}>
              <span className={styles.footerLabel}>ZONE</span>
            </div>
          </div>
        )}

        {/* Badges earned in this set */}
        {set.badges.length > 0 && (
          <section className={styles.badgesSection}>
            <h3 className={styles.sectionHeading}>Earned in this set</h3>
            <ul className={styles.badgesList}>
              {set.badges.map((badge) => {
                const Icon = BADGE_ICONS[badge.icon];
                return (
                  <li key={badge.id} className={styles.badge}>
                    <span className={styles.badgeIcon}>
                      <Icon />
                    </span>
                    <span className={styles.badgeName}>{badge.name}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
