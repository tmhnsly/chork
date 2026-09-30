import { FaArrowRight, FaBolt } from "react-icons/fa6";
import { isFlash } from "@/lib/data/logs";
import styles from "./pointsPreview.module.scss";

interface Props {
  attempts: number;
  completed: boolean;
  /** What the log is worth now it is sent, zone credit included. */
  earned: number;
  /** What sending right now would be worth, zone credit excluded. */
  preview: number;
  /** The zone toggle is on. */
  zone: boolean;
  /** What the partial credit is called here. The wall says "zone". */
  zoneLabel?: string;
}

/**
 * The points line under the attempt counter, for the wall's log sheet
 * and a game's. Three states:
 *   • completed     → "<earned> pts"
 *   • zero attempts → a non-breaking space (keeps the row's height)
 *   • mid-attempt   → "Send now → <preview> pts", with a flash bolt at
 *     one attempt and a "+1 zone" chip when the zone toggle is on
 *
 * The preview figure EXCLUDES the zone and the chip carries it, so a
 * zone route never counts twice (the number plus the chip). The caller
 * works out both figures, because a game may score against a handicap;
 * this only decides how they read. The two sheets each had a copy of
 * this markup and its styles.
 */
export function PointsPreview({ attempts, completed, earned, preview, zone, zoneLabel = "zone" }: Props) {
  if (completed) {
    return (
      <>
        <span className={styles.value}>{earned}</span> pts
      </>
    );
  }
  if (attempts === 0) return " ";
  const flash = isFlash({ attempts, completed: true });
  return (
    <>
      Send now <FaArrowRight className={styles.arrow} />{" "}
      <span className={`${styles.value} ${flash ? styles.valueFlash : ""}`}>{preview} pts</span>
      {flash && <FaBolt className={styles.flash} />}
      {zone && <span className={styles.zone}>+1 {zoneLabel}</span>}
    </>
  );
}
