import { Fragment } from "react";
import { FaLayerGroup } from "react-icons/fa6";
import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import { SectionCard } from "@/components/ui/SectionCard";
import { BrandDivider } from "@/components/ui/BrandDivider";
import type { RouteLog } from "@/lib/data";
import styles from "./statsWidget.module.scss";

interface Props {
  completions: number;
  total: number;
  flashes: number;
  points: number;
  logs: Map<string, RouteLog>;
  routeIds: string[];
  routeHasZone: boolean[];
  /** Route numbers for the chart axis (same order/length as routeIds). */
  routeNumbers?: number[];
  resetDate?: string;
  gymName?: string | null;
}

export function StatsWidget({
  completions,
  total,
  flashes,
  points,
  logs,
  routeIds,
  routeHasZone,
  routeNumbers,
  resetDate,
  gymName,
}: Props) {
  // Zones hit + zone-capable completed routes — both derived from the
  // current route/log set since they are the only places that know
  // which routes have zones.
  let zones = 0;
  let zoneCompletions = 0;
  routeIds.forEach((id, i) => {
    const log = logs.get(id);
    if (!log?.completed) return;
    if (routeHasZone[i]) {
      zoneCompletions += 1;
      if (log.zone) zones += 1;
    }
  });

  // Meta slot shows gym name and reset date side-by-side, separated
  // by the shared BrandDivider. Either can be absent; the other still
  // reads cleanly.
  const metaParts = [gymName, resetDate ? `Resets ${resetDate}` : null].filter(
    (p): p is string => Boolean(p),
  );
  const meta =
    metaParts.length > 0 ? (
      <span className={styles.metaRow}>
        {metaParts.map((part, i) => (
          <Fragment key={part}>
            {i > 0 && <BrandDivider />}
            <span>{part}</span>
          </Fragment>
        ))}
      </span>
    ) : undefined;

  return (
    <SectionCard title="Current Set" icon={<FaLayerGroup />} meta={meta}>
      <RingStatsRow
        completions={completions}
        flashes={flashes}
        zones={zones}
        points={points}
        totalRoutes={total}
        zoneCompletions={zoneCompletions}
        size={72}
      />

      <div className={styles.chartBlock}>
        <RouteChart
          logs={logs}
          routeIds={routeIds}
          routeHasZone={routeHasZone}
          routeNumbers={routeNumbers}
        />
      </div>
    </SectionCard>
  );
}
