import { BrandDivider } from "./BrandDivider";
import styles from "./setMeta.module.scss";

interface Props {
  /**
   * Date the set resets. Accepts anything already pre-formatted by
   * the caller (e.g. "20 April" or "Apr 20"); the "Reset " prefix
   * is added here. Pass `null` / omit to hide the Reset cluster.
   */
  resetDate?: string | null;
  /** Gym name. Hidden when null / omitted. */
  gymName?: string | null;
}

/**
 * Shared meta row for set-scoped cards — renders
 * "Reset 20 April · Yonder" with a `BrandDivider` between the two
 * parts. Plain conditional render (no animation) — earlier
 * CollapseFade-based exit animation was leaving the surviving gym
 * name mis-positioned on the leaderboard tab flip.
 */
export function SetMeta({ resetDate, gymName }: Props) {
  if (!resetDate && !gymName) return null;

  return (
    <span className={styles.row}>
      {resetDate && (
        <>
          <span>Reset {resetDate}</span>
          {gymName && <BrandDivider />}
        </>
      )}
      {gymName && <span className={styles.gym}>{gymName}</span>}
    </span>
  );
}
