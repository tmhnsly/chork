import type { ReactNode } from "react";
import { FaBolt, FaFlag } from "react-icons/fa6";
import styles from "./logSheetHeader.module.scss";

interface Props {
  /** Primary visible digit — route number. */
  number: number;
  /** Small flash glyph to the right of the number. Post-send state. */
  showFlash?: boolean;
  /** Small zone glyph to the left of the number. Mirrors the flash icon. */
  showZone?: boolean;
  /**
   * Line below the number — e.g. "Ungraded" or "V4 · Community grade".
   * Consumers format the content; this slot just reserves typography
   * and layout so the header height is stable across states.
   */
  subline?: ReactNode;
}

/**
 * Shared header for any attempt-logging sheet (wall + jam). The
 * route number is centred in a 3-column grid so the flanking flash
 * + zone icons never nudge the digit off-axis. Exactly mirrors the
 * header that shipped with the wall's RouteLogSheet — pulled up to
 * `ui/` so the jam log sheet feels identical on entry.
 */
export function LogSheetHeader({
  number,
  showFlash = false,
  showZone = false,
  subline,
}: Props) {
  return (
    <header className={styles.header}>
      <h2 className={styles.routeNumber}>
        <span className={styles.numberSlot} aria-hidden>
          {showZone && <FaFlag className={styles.zoneIcon} />}
        </span>
        <span className={styles.numberText}>{number}</span>
        <span className={styles.numberSlot} aria-hidden>
          {showFlash && <FaBolt className={styles.flashIcon} />}
        </span>
      </h2>
      {subline}
    </header>
  );
}
