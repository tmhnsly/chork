import { FaBolt } from "react-icons/fa6";
import type { TileState } from "@/lib/data";
import styles from "./demoTile.module.scss";

interface Props {
  number: number;
  state: TileState;
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
