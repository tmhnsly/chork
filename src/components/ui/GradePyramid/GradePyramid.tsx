import type { GradePyramid as Pyramid } from "@/lib/data/grade-distribution";
import styles from "./gradePyramid.module.scss";
import { countOf } from "@/lib/plural";

interface Props {
  pyramid: Pyramid;
}

/**
 * A climber's sends at each grade, hardest rung at the top.
 *
 * Flashes are a SUBSET of sends, so they're tinted inside the bar
 * rather than added beside it — a flash bar sitting next to a send
 * bar would double-count the same climb.
 *
 * One pyramid per (discipline, scale). Grades are never converted
 * between scales: a 6a+ is not a V-grade, and rendering it as one
 * would be a lie about what the climber did. See CONTEXT.md
 * "Discipline".
 */
export function GradePyramid({ pyramid }: Props) {
  const { title, rungs, maxSends, totalSends, totalFlashes } = pyramid;

  return (
    <section className={styles.pyramid} aria-labelledby={`pyr-${pyramid.discipline}-${pyramid.scale}`}>
      <header className={styles.header}>
        <h3 id={`pyr-${pyramid.discipline}-${pyramid.scale}`} className={styles.title}>
          {title}
        </h3>
        <p className={styles.summary}>
          {totalSends} {totalSends === 1 ? "send" : "sends"}
          {totalFlashes > 0 && <> · {totalFlashes} flashed</>}
        </p>
      </header>

      <ol className={styles.rungs}>
        {rungs.map((rung, i) => {
          const pct = (rung.sends / maxSends) * 100;
          // Of the bar's own width, not the track's — so the tint
          // marks the flashed share of that grade's sends.
          const flashPct = rung.sends > 0 ? (rung.flashes / rung.sends) * 100 : 0;
          return (
            <li key={rung.grade} className={styles.rung}>
              <span className={styles.grade}>{rung.label}</span>
              <div className={styles.track}>
                <div
                  className={styles.bar}
                  data-empty={rung.sends === 0 ? "" : undefined}
                  style={{ "--bar-w": `${pct}%`, "--i": i } as React.CSSProperties}
                >
                  {rung.flashes > 0 && (
                    <span
                      className={styles.flash}
                      style={{ "--flash-w": `${flashPct}%` } as React.CSSProperties}
                    />
                  )}
                </div>
              </div>
              <span className={styles.count}>
                {rung.sends > 0 ? rung.sends : ""}
                <span className={styles.srOnly}>
                  {` ${countOf(rung.sends, "send")} at ${rung.label}`}
                  {rung.flashes > 0 ? `, ${rung.flashes} flashed` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
