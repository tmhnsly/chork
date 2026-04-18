import { FaBolt, FaCheck, FaFlag } from "react-icons/fa6";
import { Button } from "../Button";
import styles from "./completedRow.module.scss";

interface Props {
  /** `true` when `attempts === 1 && completed` — swap the label + tint. */
  isFlash: boolean;
  /** Show the teal "Zone" chip alongside the sent/flashed badge. */
  hasZone?: boolean;
  onUndo: () => void;
  /** Disable the undo button during a pending mutation. */
  disabled?: boolean;
}

/**
 * Post-completion row: "Sent" or "Flashed" badge on the left
 * (optionally joined by a "Zone" chip), Undo button on the right.
 * Matches the Mark-as-complete button's slot height so the layout
 * above the controls block doesn't breathe when the user completes
 * or undoes a route.
 */
export function CompletedRow({ isFlash, hasZone = false, onUndo, disabled }: Props) {
  return (
    <div className={styles.row}>
      <div className={styles.badges}>
        <span className={`${styles.badge} ${isFlash ? styles.flash : ""}`}>
          {isFlash ? (
            <>
              <FaBolt className={styles.icon} /> Flashed
            </>
          ) : (
            <>
              <FaCheck className={styles.icon} /> Sent
            </>
          )}
        </span>
        {hasZone && (
          <span className={styles.zoneChip}>
            <FaFlag className={styles.icon} /> Zone
          </span>
        )}
      </div>
      <Button variant="ghost" onClick={onUndo} disabled={disabled}>
        Undo
      </Button>
    </div>
  );
}
