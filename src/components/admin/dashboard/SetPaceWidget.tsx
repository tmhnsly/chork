import { FaGaugeSimpleHigh } from "react-icons/fa6";
import { WidgetCard } from "./WidgetCard";
import type { SetOverview } from "@/lib/data/dashboard-queries";
import type { AdminSetSummary } from "@/lib/data/admin-queries";
import styles from "./setPaceWidget.module.scss";

interface Props {
  activeSet: AdminSetSummary;
  overview: SetOverview | null;
}

/**
 * Set pace — how far through the set's lifespan we are vs how much
 * climbing has happened. A set that's 80% through time but only
 * 30% sent is under-performing; a set that's 40% through and
 * already 70% sent is hot and may need a refresh.
 *
 * Pure derivation from `starts_at`/`ends_at` + the set-overview
 * totals — no extra query. The "expected vs actual" math is a
 * simple linear assumption which is fine for a setter's at-a-glance
 * read; tighter modelling would need climber-level data the
 * dashboard isn't allowed to leak anyway.
 */
export function SetPaceWidget({ activeSet, overview }: Props) {
  const totals = computeTotals(activeSet, overview);

  return (
    <WidgetCard
      title="Set pace"
      subtitle="Time elapsed vs sends booked"
      icon={<FaGaugeSimpleHigh />}
    >
      <div className={styles.body}>
        <div className={styles.track} aria-label="Time progress">
          <div
            className={styles.fillTime}
            style={{ "--pct": `${totals.timePct}%` } as React.CSSProperties}
            aria-hidden
          />
          <div
            className={styles.fillSends}
            style={{ "--pct": `${totals.sendsPct}%` } as React.CSSProperties}
            aria-hidden
          />
        </div>

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Time</dt>
            <dd className={styles.statValue}>{totals.timePct.toFixed(0)}%</dd>
            <dd className={styles.statMeta}>
              {totals.daysRemaining === null
                ? "—"
                : totals.daysRemaining <= 0
                  ? "Ended"
                  : `${totals.daysRemaining} day${totals.daysRemaining === 1 ? "" : "s"} left`}
            </dd>
          </div>

          <div className={styles.stat}>
            <dt className={styles.statLabel}>Sends</dt>
            <dd className={styles.statValue}>{totals.sendsPct.toFixed(0)}%</dd>
            <dd className={styles.statMeta}>
              {overview?.total_sends ?? 0} of {overview?.max_possible_sends ?? 0}
            </dd>
          </div>

          <div className={styles.stat}>
            <dt className={styles.statLabel}>Status</dt>
            <dd
              className={`${styles.statValue} ${statusStyle(totals.verdict)}`}
            >
              {totals.verdictLabel}
            </dd>
            <dd className={styles.statMeta}>{totals.verdictHint}</dd>
          </div>
        </dl>
      </div>
    </WidgetCard>
  );
}

interface Totals {
  timePct: number;
  sendsPct: number;
  daysRemaining: number | null;
  verdict: "ahead" | "on-pace" | "behind";
  verdictLabel: string;
  verdictHint: string;
}

function computeTotals(set: AdminSetSummary, overview: SetOverview | null): Totals {
  const startMs = Date.parse(set.starts_at);
  const endMs = Date.parse(set.ends_at);
  const nowMs = Date.now();
  const span = Math.max(1, endMs - startMs);
  const timePct = Math.max(0, Math.min(100, ((nowMs - startMs) / span) * 100));

  const daysRemaining =
    overview?.days_remaining ??
    Math.max(0, Math.ceil((endMs - nowMs) / (24 * 60 * 60 * 1000)));

  const sendsPct =
    overview && overview.max_possible_sends > 0
      ? Math.max(
          0,
          Math.min(100, (overview.total_sends / overview.max_possible_sends) * 100),
        )
      : 0;

  // Ahead = climbers sending faster than linear. Behind = the set is
  // near its end but the send rate is lagging.
  const gap = sendsPct - timePct;
  let verdict: Totals["verdict"] = "on-pace";
  let verdictLabel = "On pace";
  let verdictHint = "Right where you'd expect.";
  if (gap >= 15) {
    verdict = "ahead";
    verdictLabel = "Ahead";
    verdictHint = "Hotter than linear — consider a refresh.";
  } else if (gap <= -15) {
    verdict = "behind";
    verdictLabel = "Behind";
    verdictHint = "Sends trailing the clock.";
  }

  return {
    timePct,
    sendsPct,
    daysRemaining,
    verdict,
    verdictLabel,
    verdictHint,
  };
}

function statusStyle(verdict: Totals["verdict"]): string {
  if (verdict === "ahead") return styles.verdictAhead;
  if (verdict === "behind") return styles.verdictBehind;
  return styles.verdictOnPace;
}
