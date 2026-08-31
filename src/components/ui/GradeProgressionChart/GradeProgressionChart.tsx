import type { GradeProgression } from "@/lib/data/grade-progression";
import styles from "./gradeProgressionChart.module.scss";

interface Props {
  chart: GradeProgression;
}

/**
 * When the ceiling moved: one column per month, height scaled between
 * the window's lowest and highest best-grade, the grade written above
 * each bar. Amber marks a month whose best was flashed — the same
 * promise a route tile makes; lime is a plain send. A gap month keeps
 * its column with just the track, because a flat spot in a
 * progression says something and a chart that skips April doesn't.
 *
 * Same visual family as `RouteChart`: bare bars on tracks, no axis
 * chrome, the numbers doing the talking.
 */
export function GradeProgressionChart({ chart }: Props) {
  const span = chart.maxGrade - chart.minGrade + 1;
  const described = chart.buckets
    .map((b) => `${b.label} ${b.gradeLabel ?? "no graded send"}`)
    .join(", ");

  return (
    <figure
      className={styles.chart}
      role="img"
      aria-label={`${chart.title} — best grade per month: ${described}`}
    >
      <figcaption className={styles.header} aria-hidden>
        <span className={styles.title}>{chart.title}</span>
      </figcaption>
      <div className={styles.columns} aria-hidden>
        {chart.buckets.map((b) => {
          // Floor at a third so the window's lowest best still draws
          // as a bar rather than a sliver — the chart compares months,
          // it doesn't measure from zero.
          const pct =
            b.grade === null
              ? 0
              : Math.round(((b.grade - chart.minGrade + 1) / span) * 67 + 33);
          return (
            <div key={b.key} className={styles.column}>
              <span className={styles.gradeLabel}>{b.gradeLabel ?? ""}</span>
              <div className={styles.track}>
                {b.grade !== null && (
                  <div
                    className={styles.bar}
                    data-state={b.flashed ? "flash" : "completed"}
                    style={{ "--bar-h": `${pct}%` } as React.CSSProperties}
                  />
                )}
              </div>
              <span className={styles.monthLabel}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
