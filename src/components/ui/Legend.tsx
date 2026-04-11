import styles from "./legend.module.scss";

interface LegendItem {
  label: string;
  colour: "flash" | "completed" | "attempted";
}

const ITEMS: LegendItem[] = [
  { label: "Flashed", colour: "flash" },
  { label: "Sent", colour: "completed" },
  { label: "Attempted", colour: "attempted" },
];

/** Shared route state legend - used on the wall page and profile page. */
export function Legend() {
  return (
    <footer className={styles.legend}>
      {ITEMS.map((item) => (
        <span key={item.colour} className={styles.item}>
          <span className={`${styles.swatch} ${styles[item.colour]}`} />
          {item.label}
        </span>
      ))}
    </footer>
  );
}
