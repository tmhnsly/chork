import type { ReactNode } from "react";
import { FaArrowRight, FaBolt } from "react-icons/fa6";
import type { RouteLog } from "@/lib/data";
import { computePoints } from "@/lib/data";
import styles from "./routeLogSheet.module.scss";

/**
 * Inline points preview rendered next to the attempt counter.
 * Three states:
 *   • completed → "<pts> pts"
 *   • zero attempts → non-breaking space (keeps row height stable)
 *   • mid-attempt → "Send now → <pts> pts" with a flash bolt at 1 attempt
 *     and a "+1 zone" chip when the zone toggle is on.
 */
export function PointsPreview({
  attempts,
  zone,
  completed,
  log,
}: {
  attempts: number;
  zone: boolean;
  completed: boolean;
  log: RouteLog | null;
}): ReactNode {
  if (completed && log) {
    const pts = computePoints(log);
    return <><span className={styles.ptsValue}>{pts}</span> pts</>;
  }
  if (attempts === 0) return " ";
  const pts = computePoints({ attempts, completed: true, zone: false });
  const flash = attempts === 1;
  return (
    <>
      Send now <FaArrowRight className={styles.ptsArrow} />{" "}
      <span className={`${styles.ptsValue} ${flash ? styles.ptsValueFlash : ""}`}>{pts} pts</span>
      {flash && <FaBolt className={styles.ptsFlash} />}
      {zone && <span className={styles.ptsZone}>+1 zone</span>}
    </>
  );
}
