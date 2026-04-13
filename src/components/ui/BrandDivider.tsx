import styles from "./brandDivider.module.scss";

interface Props {
  /** Render as a bullet (default) or a vertical bar. */
  variant?: "bullet" | "bar";
  className?: string;
}

/**
 * Lime/brand-coloured divider used to separate short inline content
 * (e.g. `Gym name · Resets Apr 22` in the Current Set card meta). Uses
 * Radix lime-9 to echo the SVG logo so the divider reads as part of
 * the brand, not neutral chrome.
 *
 * Always use this when you need an inline separator — never hand-roll
 * a "·" / "|" one-off, so the visual language stays consistent.
 */
export function BrandDivider({ variant = "bullet", className }: Props) {
  return (
    <span
      aria-hidden
      className={`${styles.divider} ${variant === "bar" ? styles.bar : styles.bullet} ${className ?? ""}`}
    />
  );
}
