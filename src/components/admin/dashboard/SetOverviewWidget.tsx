import { WidgetCard } from "./WidgetCard";
import type { SetOverview } from "@/lib/data/dashboard-queries";
import styles from "./setOverviewWidget.module.scss";

interface Props {
  overview: SetOverview | null;
  setLabel: string;
}

/**
 * Top-of-dashboard snapshot — total routes, total sends, completion
 * rate, days remaining, active climber count. Uses big italic numbers
 * matching the climber-facing stat style.
 */
export function SetOverviewWidget({ overview, setLabel }: Props) {
  return (
    <WidgetCard
      title="Active set"
      subtitle={setLabel}
      empty={overview === null}
      emptyMessage="No set data yet."
    >
      {overview && (
        <div className={styles.grid}>
          <Stat label="Routes" value={overview.total_routes} />
          <Stat label="Sends" value={overview.total_sends} accent="accent" />
          <Stat
            label="Completion"
            value={`${overview.send_completion_pct}%`}
          />
          <Stat
            label="Days left"
            value={
              overview.days_remaining === null
                ? "∞"
                : overview.days_remaining === 0
                  ? "Today"
                  : overview.days_remaining
            }
          />
          <Stat
            label="Climbers"
            value={overview.active_climber_count}
            accent="teal"
          />
        </div>
      )}
    </WidgetCard>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "accent" | "teal";
}) {
  const valueClass = [
    styles.value,
    accent === "accent" ? styles.valueAccent : "",
    accent === "teal" ? styles.valueTeal : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={styles.cell}>
      <span className={valueClass}>{value}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
