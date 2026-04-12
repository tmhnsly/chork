import { FaBolt, FaBullseye } from "react-icons/fa6";
import styles from "./scoringBreakdown.module.scss";

const ROWS: { attempts: string; points: number; flash?: boolean }[] = [
  { attempts: "Flash (1 attempt)", points: 4, flash: true },
  { attempts: "2 attempts", points: 3 },
  { attempts: "3 attempts", points: 2 },
  { attempts: "4+ attempts", points: 1 },
];

/**
 * Scoring rules card — mirrors the `computePoints` formula in
 * src/lib/data/logs.ts. Kept as a small static card rather than a dialog
 * so climbers see the points economy directly on the Chorkboard.
 */
export function ScoringBreakdown() {
  return (
    <section className={styles.card} aria-labelledby="scoring-heading">
      <header className={styles.header}>
        <h2 id="scoring-heading" className={styles.heading}>How scoring works</h2>
      </header>

      <ul className={styles.list}>
        {ROWS.map((row) => (
          <li key={row.attempts} className={styles.row}>
            <span className={styles.attempts}>
              {row.flash && <FaBolt className={styles.flashIcon} aria-hidden />}
              {row.attempts}
            </span>
            <span className={`${styles.points} ${row.flash ? styles.pointsFlash : ""}`}>
              {row.points}
              <span className={styles.pointsUnit}>pts</span>
            </span>
          </li>
        ))}
      </ul>

      <p className={styles.zone}>
        <FaBullseye aria-hidden className={styles.zoneIcon} />
        <span>
          <strong>+1 point</strong> for claiming the zone hold.
        </span>
      </p>
    </section>
  );
}
