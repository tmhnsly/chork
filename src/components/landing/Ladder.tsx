import { ScoringChart } from "@/components/ui/ScoringChart/ScoringChart";
import { SCORING_ROWS } from "@/components/ui/ScoringChart/scoring-rows";
import { LADDER } from "./copy";
import { SectionCopy } from "./Section";
import styles from "./ladder.module.scss";

/** Fewer goes, more points — the same bar chart the Chorkboard explains itself with. */
export function Ladder() {
  return (
    <section className={styles.ladder}>
      <SectionCopy headline={LADDER.headline} body={LADDER.body} />
      <div className={styles.chart}>
        <ScoringChart rows={SCORING_ROWS} plane="page" />
      </div>
    </section>
  );
}
