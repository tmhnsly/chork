import { formatSetLabel } from "@/lib/data/set-label";
import type {
  SetOverview,
  TopRouteRow,
  EngagementPoint,
  FlashLeader,
  ZoneSendRow,
  AllTimeOverview,
} from "@/lib/data/dashboard-queries";
import type { AdminSetSummary } from "@/lib/data/admin-queries";
import { SetOverviewWidget } from "./SetOverviewWidget";
import { TopRoutesWidget } from "./TopRoutesWidget";
import { EngagementWidget } from "./EngagementWidget";
import { FlashLeaderboardWidget } from "./FlashLeaderboardWidget";
import { ZoneSendWidget } from "./ZoneSendWidget";
import { AllTimeOverviewWidget } from "./AllTimeOverviewWidget";
import styles from "./adminDashboard.module.scss";

interface Props {
  activeSet: AdminSetSummary;
  overview: SetOverview | null;
  topRoutes: TopRouteRow[];
  engagement: EngagementPoint[];
  activeCount: number;
  flashes: FlashLeader[];
  zoneRows: ZoneSendRow[];
  allTime: AllTimeOverview | null;
}

/**
 * Single-column on mobile, two-column grid on desktop. Widgets are
 * grouped so the most actionable info lands first (set overview) and
 * the reference data (all-time, setters) trails. The `AdminDashboard`
 * shell is a Server Component; interactive bits (metric switcher in
 * TopRoutesWidget) are client components that receive props only.
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
}: Props) {
  const label = formatSetLabel({
    name: activeSet.name,
    starts_at: activeSet.starts_at,
    ends_at: activeSet.ends_at,
  });

  return (
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

      <div className={styles.wide}>
        <AllTimeOverviewWidget overview={allTime} />
      </div>
    </div>
  );
}
