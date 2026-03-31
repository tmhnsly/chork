import { FaBolt } from "react-icons/fa6";
import styles from "./demoTile.module.scss";

type DemoTileState = "empty" | "attempted" | "completed" | "flash";

interface Props {
  number: number;
  state: DemoTileState;
}

/**
 * Presentational-only punch tile for the landing page hero.
 * Same visual appearance as PunchTile but no interactivity —
 * rendered as a div, no click handler, no hover, no cursor.
 */
export function DemoTile({ number, state }: Props) {
  return (
    <div className={`${styles.tile} ${styles[state]}`}>
      <span className={styles.number}>{number}</span>
      {state === "flash" && (
        <span className={styles.flashBadge}>
          <FaBolt />
        </span>
      )}
    </div>
  );
}

export type { DemoTileState };
