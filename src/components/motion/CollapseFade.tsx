"use client";

import type { CSSProperties, ReactNode } from "react";
import styles from "./collapseFade.module.scss";

interface Props {
  /** When `true`, content is expanded + faded in. When `false`, it
   *  collapses the horizontal space, fades out and slides down. */
  show: boolean;
  children: ReactNode;
  /**
   * Max-width the slot can expand to when shown. CSS length unit —
   * defaults to `20ch`, which comfortably fits meta text like
   * "Resets 20 April". Pass a larger value for longer content.
   */
  maxWidth?: string;
  /**
   * HTML element to render. Defaults to `span` so the component
   * stays inline by default — override to `div` for block contexts.
   */
  as?: "span" | "div";
  className?: string;
}

/**
 * Reusable inline collapse + slide + fade for showing/hiding
 * content without triggering a jump in the surrounding layout.
 * Uses the same slide-up-from-below motion as `RollingNumber`'s
 * increment animation so swaps across the app share one vocabulary:
 * new content arrives with the same gesture whether it's a digit
 * ticking up or a "Resets 20 April" appearing alongside a gym name.
 *
 * Transitions both `max-width` (for width collapse) and
 * `transform + opacity` (for the slide-fade) — CSS-only, no JS
 * measurement, so it renders correctly on the server.
 */
export function CollapseFade({
  show,
  children,
  maxWidth = "20ch",
  as = "span",
  className,
}: Props) {
  const Tag = as;
  const cls = [styles.slot, show ? styles.open : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag
      className={cls}
      style={{ "--reveal-max-width": maxWidth } as CSSProperties}
      aria-hidden={!show}
    >
      {children}
    </Tag>
  );
}
