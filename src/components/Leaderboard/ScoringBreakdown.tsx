import { ScoringChart, type ScoreRow } from "@/components/ScoringChart/ScoringChart";
import styles from "./scoringBreakdown.module.scss";

// Mirrors the points formula in src/lib/data/logs.ts. The `weight`
// values are the scoring ratios relative to a flash (4 pts = 1.0) so
// bar lengths stay honest. Zone is shown as a +1 stipend, not a
// competing bar — weight matches its point value (0.25 of a flash).
const ROWS: ScoreRow[] = [
  { label: "Flash (1st try)", points: "4 pts", weight: 1,    accent: "flash" },
  { label: "2 attempts",      points: "3 pts", weight: 0.75 },
  { label: "3 attempts",      points: "2 pts", weight: 0.5  },
  { label: "4+ attempts",     points: "1 pt",  weight: 0.25 },
  { label: "Zone hold",       points: "+1 pt", weight: 0.25, accent: "zone" },
];

/**
 * Scoring rules card on the Chorkboard. Uses the same animated bar
 * chart as the landing page (src/components/ScoringChart) so the two
 * surfaces don't drift — one visual vocabulary for "how scoring works"
 * across marketing and in-app.
 */
export function ScoringBreakdown() {
  return (
    <section className={styles.card} aria-labelledby="scoring-heading">
      <header className={styles.header}>
        <h2 id="scoring-heading" className={styles.heading}>How scoring works</h2>
      </header>
      <ScoringChart rows={ROWS} />
    </section>
  );
}
