import styles from "./previousSetsSection.module.scss";

interface SetSummary {
  id: string;
  label: string;
  completions: number;
  flashes: number;
  points: number;
}

interface Props {
  sets: SetSummary[];
}

/** Previous sets cards with coloured stat values. */
export function PreviousSetsSection({ sets }: Props) {
  if (sets.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Previous sets</h2>
      <div className={styles.list}>
        {sets.map((s) => (
          <div key={s.id} className={styles.card}>
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
        ))}
      </div>
    </section>
  );
}
