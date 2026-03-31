import { FaBolt, FaBullseye } from "react-icons/fa6";
import styles from "./scoringSection.module.scss";

interface ScoreRow {
  label: string;
  points: string;
  accent?: "flash" | "zone";
}

interface Props {
  rows: ScoreRow[];
}

export function ScoringSection({ rows }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.heading}>How scoring works</h2>
        <p className={styles.sub}>
          Points are earned per route. The fewer attempts, the higher the score.
        </p>
        <div className={styles.table}>
          {rows.map((row) => (
            <div
              key={row.label}
              className={`${styles.row} ${row.accent === "flash" ? styles.flashRow : ""} ${row.accent === "zone" ? styles.zoneRow : ""}`}
            >
              <span className={styles.label}>
                {row.accent === "flash" && <FaBolt className={styles.icon} />}
                {row.accent === "zone" && <FaBullseye className={styles.icon} />}
                {row.label}
              </span>
              <span className={styles.points}>{row.points}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export type { ScoreRow };
