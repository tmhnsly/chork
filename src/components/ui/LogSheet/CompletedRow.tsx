import { FaBolt, FaCheck, FaFlag } from "react-icons/fa6";
import { Button } from "../Button";
import styles from "./completedRow.module.scss";

interface Props {
  /** `true` when `attempts === 1 && completed` — swap the label + tint. */
  isFlash: boolean;
  /** Show the teal partial-credit chip alongside the sent/flashed badge. */
  hasZone?: boolean;
  /**
   * What partial credit is called here. A boulder has a zone; a rope
   * route has a highpoint. Defaults to "Zone" so the gym Wall — which
   * is boulders — needs no change. Pass
   * `partialCreditLabel(discipline)` from a Match.
   */
  zoneLabel?: string;
  onUndo: () => void;
  /** Disable the undo button during a pending mutation. */
  disabled?: boolean;
}

/**
 * Post-completion row: "Sent" or "Flashed" badge on the left
 * (optionally joined by a partial-credit chip), "Undo send" on the right.
 * Matches the Mark-as-complete button's slot height so the layout
 * above the controls block doesn't breathe when the user completes
 * or undoes a route.
 */
export function CompletedRow({
  isFlash,
  hasZone = false,
  zoneLabel = "Zone",
  onUndo,
  disabled,
}: Props) {
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
            <FaFlag className={styles.icon} /> {zoneLabel}
          </span>
        )}
      </div>
      {/* "Undo" alone doesn't say what it undoes — next to a
          "Flashed" badge it could plausibly mean the flash, the zone,
          or the attempt count. Naming the send matches the badge
          beside it and the "Mark as complete" button it replaced, and
          holds for a flash too, since a flash is a send. */}
      <Button variant="ghost" onClick={onUndo} disabled={disabled}>
        Undo send
      </Button>
    </div>
  );
}
