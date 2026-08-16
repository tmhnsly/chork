import styles from "./progressRing.module.scss";

interface Props {
  /** 0–1. Clamped, so a stale over-target value can't overdraw. */
  progress: number;
  /**
   * Colour family for the filled arc. Matches the earned-state tint,
   * so a flash-category badge reads amber at 50% and at 100% rather
   * than changing hue the moment it completes.
   */
  family?: "accent" | "flash" | "success";
}

/**
 * The arc that says "you're part way there".
 *
 * Same pattern as ActivityRings — mono track, family-coloured fill,
 * `stroke-dashoffset` drives the arc — and `pathLength={1}` so the
 * offset range is a plain 0–1 whatever the radius.
 *
 * Lives here rather than inside `BadgeShelf` because three surfaces
 * draw it now: the shelf, the achievement card, and the detail
 * sheet's hero. It was exported from the shelf and imported by the
 * sheet, which made a feature component depend on another feature's
 * internals for a shape that is really just a primitive.
 *
 * Absolutely positioned — the caller supplies a `position: relative`
 * box the size of the circle it should hug.
 */
export function ProgressRing({ progress, family = "accent" }: Props) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx={50} cy={50} r={46} fill="none" stroke="var(--mono-border)" strokeWidth={6} />
      <circle
        cx={50}
        cy={50}
        r={46}
        fill="none"
        stroke={`var(--${family}-solid)`}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - clamped}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}
