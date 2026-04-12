"use client";

import { useMemo, useState } from "react";
import { WidgetCard } from "./WidgetCard";
import type { TopRouteRow } from "@/lib/data/dashboard-queries";
import styles from "./topRoutesWidget.module.scss";

type Metric = "sends" | "attempts" | "flash_rate";

const METRIC_LABELS: Record<Metric, string> = {
  sends: "Sends",
  attempts: "Attempts",
  flash_rate: "Flash rate",
};

interface Props {
  routes: TopRouteRow[];
}

/**
 * Ranked list of routes with a metric switcher (sends / attempts /
 * flash rate). Bars are normalised against the max value for the
 * current metric so the widget is self-scaling.
 */
export function TopRoutesWidget({ routes }: Props) {
  const [metric, setMetric] = useState<Metric>("sends");

  const sorted = useMemo(() => {
    const copy = [...routes];
    copy.sort((a, b) => {
      const av = pick(a, metric);
      const bv = pick(b, metric);
      if (av === null && bv === null) return a.number - b.number;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av || a.number - b.number;
    });
    return copy;
  }, [routes, metric]);

  const max = useMemo(() => {
    let m = 0;
    for (const r of sorted) {
      const v = pick(r, metric);
      if (v !== null && v > m) m = v;
    }
    return m;
  }, [sorted, metric]);

  return (
    <WidgetCard
      title="Top routes"
      empty={routes.length === 0}
      emptyMessage="No route activity yet."
      actions={
        <div className={styles.metricRow} role="tablist" aria-label="Metric">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              className={`${styles.metricChip} ${metric === m ? styles.metricChipActive : ""}`}
              onClick={() => setMetric(m)}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      }
    >
      <ul className={styles.list}>
        {sorted.slice(0, 10).map((r) => {
          const v = pick(r, metric);
          const pct = max > 0 && v !== null ? (v / max) * 100 : 0;
          return (
            <li key={r.route_id} className={styles.row}>
              <span className={styles.number}>{r.number}</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ "--bar-w": `${pct}%` } as React.CSSProperties}
                  aria-hidden
                />
              </div>
              <span className={styles.value}>{formatValue(v, metric)}</span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

function pick(row: TopRouteRow, metric: Metric): number | null {
  if (metric === "sends") return row.send_count;
  if (metric === "attempts") return row.attempt_count;
  return row.flash_rate;
}

function formatValue(v: number | null, metric: Metric): string {
  if (v === null) return "—";
  if (metric === "flash_rate") return `${v.toFixed(0)}%`;
  return String(v);
}
