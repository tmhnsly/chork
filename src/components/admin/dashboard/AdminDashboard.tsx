"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatSetLabel } from "@/lib/data/set-label";
import type {
  SetOverview,
  TopRouteRow,
  EngagementPoint,
  FlashLeader,
  ZoneSendRow,
  AllTimeOverview,
  GradeDistributionRow,
  SetterBreakdownRow,
} from "@/lib/data/dashboard-queries";
import type { AdminSetSummary } from "@/lib/data/admin-queries";
import type { GradingScale } from "@/lib/data/grade-label";
import { SetOverviewWidget } from "./SetOverviewWidget";
import { TopRoutesWidget } from "./TopRoutesWidget";
import { EngagementWidget } from "./EngagementWidget";
import { FlashLeaderboardWidget } from "./FlashLeaderboardWidget";
import { ZoneSendWidget } from "./ZoneSendWidget";
import { AllTimeOverviewWidget } from "./AllTimeOverviewWidget";
import { GradeDistributionWidget } from "./GradeDistributionWidget";
import { SetterBreakdownWidget } from "./SetterBreakdownWidget";
import styles from "./adminDashboard.module.scss";

type Tab = "set" | "all";

interface Props {
  activeSet: AdminSetSummary;
  overview: SetOverview | null;
  topRoutes: TopRouteRow[];
  engagement: EngagementPoint[];
  activeCount: number;
  flashes: FlashLeader[];
  zoneRows: ZoneSendRow[];
  allTime: AllTimeOverview | null;
  gradeDistribution: GradeDistributionRow[];
  setterRows: SetterBreakdownRow[];
}

/**
 * Dashboard shell. Single-column on mobile, two-column grid on desktop;
 * wide widgets span full width. The "This set" / "All time" tabs
 * switch which widget cluster is visible — both tabs' data is fetched
 * up-front so switching is instant with no layout shift.
 *
 * Tab implementation uses the existing SegmentedControl primitive for
 * visual consistency with the climber-side Chorkboard header.
 */
export function AdminDashboard({
  activeSet,
  overview,
  topRoutes,
  engagement,
  activeCount,
  flashes,
  zoneRows,
  allTime,
  gradeDistribution,
  setterRows,
}: Props) {
  const [tab, setTab] = useState<Tab>("set");

  const label = formatSetLabel({
    name: activeSet.name,
    starts_at: activeSet.starts_at,
    ends_at: activeSet.ends_at,
  });

  const scale = activeSet.grading_scale as GradingScale;
  const showGradeDistribution = scale !== "points" && gradeDistribution.length > 0;
  const showSetters = setterRows.length > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.tabRow}>
        <SegmentedControl<Tab>
          options={[
            { value: "set", label: "This set" },
            { value: "all", label: "All time" },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Dashboard timeframe"
        />
      </div>

      {tab === "set" ? (
        <div className={styles.grid}>
          <div className={styles.wide}>
            <SetOverviewWidget overview={overview} setLabel={label} />
          </div>

          <EngagementWidget points={engagement} activeCount={activeCount} />
          <FlashLeaderboardWidget leaders={flashes} />

          <div className={styles.wide}>
            <TopRoutesWidget routes={topRoutes} />
          </div>

          <div className={styles.wide}>
            <ZoneSendWidget rows={zoneRows} />
          </div>

          {showGradeDistribution && (
            <div className={styles.wide}>
              <GradeDistributionWidget
                distribution={gradeDistribution}
                scale={scale}
              />
            </div>
          )}

          {showSetters && (
            <div className={styles.wide}>
              <SetterBreakdownWidget rows={setterRows} />
            </div>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          <div className={styles.wide}>
            <AllTimeOverviewWidget overview={allTime} />
          </div>
          <div className={styles.wide}>
            <EngagementWidget points={engagement} activeCount={activeCount} />
          </div>
        </div>
      )}
    </div>
  );
}
