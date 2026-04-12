import { ScoringChart, type ScoreRow } from "@/components/ScoringChart/ScoringChart";
import styles from "./scoringSection.module.scss";

interface Props {
  rows: ScoreRow[];
}

/**
 * Landing-page hero panel wrapping the shared ScoringChart. The chart
 * itself lives in src/components/ScoringChart so the in-app Chorkboard
 * can render the same visual inside a card frame.
 */
export function ScoringSection({ rows }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.heading}>How scoring works</h2>
        <p className={styles.sub}>
          Points are earned per route. The fewer attempts, the higher the score.
        </p>
        <ScoringChart rows={rows} />
      </div>
    </section>
  );
}

export type { ScoreRow };
