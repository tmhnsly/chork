import type { ReactNode } from "react";
import styles from "./collapse.module.scss";

interface Props {
  /** Whether the content is expanded. */
  open: boolean;
  children: ReactNode;
  /**
   * Spacing toward the sibling ABOVE/BELOW lives inside the animated
   * content so it collapses to zero with the row — parent flex `gap`
   * around a zero-height wrapper leaves dead space behind.
   */
  padTop?: boolean;
  padBottom?: boolean;
}

/**
 * Animated expand/collapse for content of unknown height. Closed
 * content stays mounted (so both directions animate) but is
 * `inert` + aria-hidden, so it is unreachable by tap, tab, and
 * screen reader alike.
 *
 * Animation strategy lives in `mixins/_collapse.scss`: grid-rows
 * baseline that works on iOS Safari, `interpolate-size` height
 * upgrade on Chromium.
 */
export function Collapse({ open, children, padTop, padBottom }: Props) {
  return (
    <div
      className={`${styles.root} ${open ? styles.open : ""}`}
      aria-hidden={!open}
      inert={!open || undefined}
    >
      <div
        className={`${styles.inner} ${padTop ? styles.padTop : ""} ${padBottom ? styles.padBottom : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
