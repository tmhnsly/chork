import { WidgetCard } from "./WidgetCard";
import type { GradeDistributionRow } from "@/lib/data/dashboard-queries";
import { formatGrade, type GradingScale } from "@/lib/data/grade-label";
import styles from "./gradeDistributionWidget.module.scss";

interface Props {
  distribution: GradeDistributionRow[];
  scale: GradingScale;
}

interface RouteGroup {
  number: number;
  votes: Map<number, number>;
  total: number;
  max: number;
  min: number;
}

/**
 * Per-route histogram of community grade votes. Each route gets a
 * mini horizontal bar spanning its vote range; bars widen with the
 * vote count at each grade.
 *
 * Hidden from the dashboard when the set's grading scale is "points"
 * — the admin opted out of grading so there's nothing to render.
 */
export function GradeDistributionWidget({ distribution, scale }: Props) {
  if (scale === "points") return null;

  const byRoute = new Map<string, RouteGroup>();
  let globalMaxVotes = 0;

  for (const row of distribution) {
    const existing = byRoute.get(row.route_id);
    if (!existing) {
      byRoute.set(row.route_id, {
        number: row.number,
        votes: new Map([[row.grade, row.vote_count]]),
        total: row.vote_count,
        max: row.grade,
        min: row.grade,
      });
    } else {
      existing.votes.set(row.grade, row.vote_count);
      existing.total += row.vote_count;
      if (row.grade > existing.max) existing.max = row.grade;
      if (row.grade < existing.min) existing.min = row.grade;
    }
    if (row.vote_count > globalMaxVotes) globalMaxVotes = row.vote_count;
  }

  const routes = [...byRoute.entries()]
    .map(([id, group]) => ({ id, ...group }))
    .sort((a, b) => a.number - b.number);

  return (
    <WidgetCard
      title="Community grades"
      subtitle="How climbers are rating each route"
      empty={routes.length === 0}
      emptyMessage="No grade votes yet."
    >
      <ul className={styles.list}>
        {routes.map((route) => {
          const gradeRange: number[] = [];
          for (let g = route.min; g <= route.max; g++) gradeRange.push(g);
          return (
            <li key={route.id} className={styles.row}>
              <span className={styles.number}>{route.number}</span>
              <div className={styles.histogram}>
                {gradeRange.map((grade) => {
                  const count = route.votes.get(grade) ?? 0;
                  const height = globalMaxVotes > 0 ? (count / globalMaxVotes) * 100 : 0;
                  const label = formatGrade(grade, scale) ?? String(grade);
                  return (
                    <div key={grade} className={styles.bucket} title={`${label}: ${count} vote${count === 1 ? "" : "s"}`}>
                      <div
                        className={styles.bar}
                        style={{ "--bar-h": `${Math.max(6, height)}%` } as React.CSSProperties}
                        aria-hidden
                      />
                      <span className={styles.bucketLabel}>{label}</span>
                    </div>
                  );
                })}
              </div>
              <span className={styles.totalVotes}>
                {route.total} vote{route.total === 1 ? "" : "s"}
              </span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
