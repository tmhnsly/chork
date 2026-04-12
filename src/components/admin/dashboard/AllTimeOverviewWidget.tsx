import { WidgetCard } from "./WidgetCard";
import type { AllTimeOverview } from "@/lib/data/dashboard-queries";
import styles from "./allTimeOverviewWidget.module.scss";

interface Props {
  overview: AllTimeOverview | null;
}

/**
 * All-time view — ever-seen unique climbers, total sends, most popular
 * route ever, set count. Keeps the "All time" tab of the spec visible
 * without requiring a full tab switch (one dashboard page, richer
 * content).
 */
export function AllTimeOverviewWidget({ overview }: Props) {
  return (
    <WidgetCard
      title="All time"
      subtitle="Since this gym joined Chork"
      empty={overview === null}
      emptyMessage="No history yet."
    >
      {overview && (
        <div className={styles.grid}>
          <Stat label="Unique climbers" value={overview.unique_climbers} />
          <Stat label="Total sends" value={overview.total_sends} accent="accent" />
          <Stat label="Sets run" value={overview.set_count} />
          <Stat
            label="Most-sent route"
            value={
              overview.top_route_number !== null
                ? `#${overview.top_route_number}`
                : "—"
            }
            subtitle={
              overview.top_route_send_count !== null &&
              overview.top_route_send_count > 0
                ? `${overview.top_route_send_count} sends`
                : undefined
            }
          />
        </div>
      )}
    </WidgetCard>
  );
}

function Stat({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: "accent";
}) {
  return (
    <div className={styles.cell}>
      <span className={`${styles.value} ${accent === "accent" ? styles.valueAccent : ""}`}>
        {value}
      </span>
      <span className={styles.label}>{label}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
    </div>
  );
}
