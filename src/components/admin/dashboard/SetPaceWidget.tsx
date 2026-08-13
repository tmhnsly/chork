import { FaGaugeSimpleHigh } from "react-icons/fa6";
import { WidgetCard } from "./WidgetCard";
import type { SetOverview } from "@/lib/data/dashboard-queries";
import styles from "./setPaceWidget.module.scss";

interface Props {
  /**
   * Both halves of the pace comparison. `activeSet` used to be passed
   * too, purely so this component could do its own date arithmetic —
   * migration 075 moved that into the RPC, so the set is no longer
   * needed here.
   */
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
export function SetPaceWidget({ overview }: Props) {
  const totals = computeTotals(overview);

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

/**
 * Both halves of the comparison now come from the same RPC, and both
 * are derived from Postgres's clock.
 *
 * `timePct` used to be computed here from a `Date.now()` captured in
 * a lazy `useState`. That passes `react-hooks/purity` but still runs
 * on the server and again on the client, at different instants, so
 * the two percentages disagreed in their far decimals and React
 * logged a hydration mismatch on every admin load. It also compared a
 * Node clock against a Postgres one, which can drift independently —
 * wrong beyond the hydration symptom. Migration 075 moved it into
 * `get_set_overview` alongside `days_remaining`, which was already
 * computed in SQL for exactly this reason.
 *
 * Both values are null when the overview RPC returns nothing; the
 * widget reads as an empty pace rather than inventing one from a
 * clock the server doesn't share.
 */
function computeTotals(overview: SetOverview | null): Totals {
  const timePct = overview?.time_elapsed_pct ?? 0;
  const daysRemaining = overview?.days_remaining ?? null;

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
