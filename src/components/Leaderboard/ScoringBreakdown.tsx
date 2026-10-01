import { ScoringChart } from "@/components/ui/ScoringChart/ScoringChart";
import { SCORING_ROWS } from "@/components/ui/ScoringChart/scoring-rows";
import styles from "./scoringBreakdown.module.scss";

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
      <ScoringChart rows={SCORING_ROWS} />
    </section>
  );
}
