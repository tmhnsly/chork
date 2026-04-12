import { SendsGridThumbnail } from "@/components/SendsGridThumbnail/SendsGridThumbnail";
import type { RouteLog } from "@/lib/data";
import styles from "./previousSetsSection.module.scss";

type ThumbnailLog = Pick<RouteLog, "attempts" | "completed" | "zone">;

interface SetSummary {
  id: string;
  label: string;
  completions: number;
  flashes: number;
  points: number;
  routes: Array<{ id: string; number: number; has_zone: boolean }>;
  logs: Map<string, ThumbnailLog>;
}

interface Props {
  sets: SetSummary[];
  /**
   * When true, render a friendly empty state instead of nothing.
   * Pass this for users who are on their first set — distinguishes
   * "no history yet" from "not applicable" (e.g. no gym selected).
   */
  showEmptyState?: boolean;
}

/** Previous sets cards with stats + mini send grid thumbnails. */
export function PreviousSetsSection({ sets, showEmptyState = false }: Props) {
  if (sets.length === 0) {
    if (!showEmptyState) return null;
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>Previous sets</h2>
        <p className={styles.empty}>
          You&apos;re on your first set — check back after the reset to see it here.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Previous sets</h2>
      <div className={styles.list}>
        {sets.map((s) => (
          <div key={s.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.label}>{s.label}</span>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={`${styles.value} ${styles.sendsValue}`}>{s.completions}</span>
                  <span className={`${styles.statLabel} ${styles.sendsLabel}`}>sends</span>
                </div>
                <div className={styles.stat}>
                  <span className={`${styles.value} ${styles.flashValue}`}>{s.flashes}</span>
                  <span className={`${styles.statLabel} ${styles.flashLabel}`}>flash</span>
                </div>
                <div className={styles.stat}>
                  <span className={`${styles.value} ${styles.pointsValue}`}>{s.points}</span>
                  <span className={`${styles.statLabel} ${styles.pointsLabel}`}>pts</span>
                </div>
              </div>
            </div>
            {s.routes.length > 0 && (
              <SendsGridThumbnail routes={s.routes} logs={s.logs} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
