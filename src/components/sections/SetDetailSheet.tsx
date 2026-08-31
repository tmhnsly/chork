"use client";

import { useClientResource } from "@/hooks/use-client-resource";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SheetBody } from "@/components/ui";
import { RingStatsRow } from "@/components/ui/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/ui/RouteChart/RouteChart";
import { ICON_MAP as BADGE_ICONS } from "@/lib/badge-icons";
import { pointsPerSend } from "@/lib/data/profile-stats";
import { fetchSetPlacement } from "@/app/u/[username]/actions";
import type { SetCell } from "./PreviousSetsGrid";
import styles from "./setDetailSheet.module.scss";

const EM_DASH = "\u2014";

interface Props {
  open: boolean;
  set: SetCell;
  gymId: string;
  userId: string;
  onClose: () => void;
}

export function SetDetailSheet({ open, set, userId, onClose }: Props) {
  // Keyed fetch — loading derives from the key, stale responses are
  // rejected structurally. An `{ error }` result throws into the
  // hook's error slot, which renders identically to the old handling:
  // loading ends, rank stays null (RingStatsRow shows its fallback).
  const { data: placement, loading: rankLoading } = useClientResource<{
    rank: number | null;
  }>(`${userId}|${set.id}`, async () => {
    const result = await fetchSetPlacement(userId, set.id);
    if ("error" in result) throw new Error(result.error);
    return result;
  });
  const rank = placement?.rank ?? null;

  const pps = pointsPerSend(set.points, set.completions);
  const flashRate = set.completions > 0 ? set.flashes / set.completions : null;
  const completionRate = set.totalRoutes > 0 ? set.completions / set.totalRoutes : null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={set.label}
      description={`Stats for ${set.label}`}
    >
      <SheetBody gap={5}>
        {/* The sheet's title bar already shows `set.label`, so the
            body only carries what the title bar can't: whether this
            is the set currently on the wall. Repeating the date range
            directly under itself was the sheet saying the same thing
            twice before any of the stats got a look in. */}
        {set.isActive && (
          <header className={styles.header}>
            <span className={styles.activeTag}>Current set</span>
          </header>
        )}

        {/* Ring stats — rank sits next to points on the right so the
            header stays clean and the placement reads as one unit. */}
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
          maxPoints={set.maxPoints}
          rank={rank}
          rankLoading={rankLoading}
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
              logs={set.logs}
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
      </SheetBody>
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
