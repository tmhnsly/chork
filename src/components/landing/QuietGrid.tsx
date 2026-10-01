import { QUIET } from "./copy";
import styles from "./quietGrid.module.scss";

/** The things worth knowing that have no screen of their own. */
export function QuietGrid() {
  return (
    <section className={styles.quiet} aria-labelledby="quiet-heading">
      <h2 id="quiet-heading" className={styles.headline}>{QUIET.headline}</h2>
      <ul className={styles.grid}>
        {QUIET.items.map((item) => (
          <li key={item.title} className={styles.item}>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.body}>{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
