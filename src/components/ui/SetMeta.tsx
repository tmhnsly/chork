import { BrandDivider } from "./BrandDivider";
import styles from "./setMeta.module.scss";

interface Props {
  /**
   * Countdown string to the set reset, produced by
   * `formatSetResetCountdown(ends_at)` — e.g. "4d", "2w5d", "today",
   * "ended". Rendered as "Resets in {resetIn}" (or "Reset {resetIn}"
   * when the value is a non-duration keyword like "today"/"ended").
   * Pass `null` / omit to hide the reset cluster.
   */
  resetIn?: string | null;
  /** Gym name. Hidden when null / omitted. */
  gymName?: string | null;
}

/**
 * Shared meta row for set-scoped cards — renders
 * "Resets in 2w5d · Yonder" with a `BrandDivider` between the two
 * parts. Plain conditional render (no animation) — earlier
 * CollapseFade-based exit animation was leaving the surviving gym
 * name mis-positioned on the leaderboard tab flip.
 */
export function SetMeta({ resetIn, gymName }: Props) {
  if (!resetIn && !gymName) return null;

  const resetLabel = resetIn
    ? resetIn === "ended"
      ? "Set ended"
      : resetIn === "today"
        ? "Resets today"
        : `Resets in ${resetIn}`
    : null;

  return (
    <span className={styles.row}>
      {resetLabel && (
        <>
          <span>{resetLabel}</span>
          {gymName && <BrandDivider />}
        </>
      )}
      {gymName && <span className={styles.gym}>{gymName}</span>}
    </span>
  );
}
