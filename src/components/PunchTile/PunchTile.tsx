"use client";

import { memo, type CSSProperties } from "react";
import { FaBolt, FaFlag } from "react-icons/fa6";
import type { TileState } from "@/lib/data";
import styles from "./punchTile.module.scss";

interface Props {
  number: number;
  state: TileState;
  zone?: boolean;
  /** Grade label to display on completed tiles (e.g. "V4") */
  gradeLabel?: string;
  onClick?: () => void;
  className?: string;
  /** Remove min-size constraints for display-only contexts */
  compact?: boolean;
  style?: CSSProperties;
}

export const PunchTile = memo(function PunchTile({ number, state, zone, gradeLabel, onClick, className, compact, style }: Props) {
  const cls = [
    styles.tile,
    styles[state],
    compact && styles.compact,
    !onClick && styles.static,
    className,
  ].filter(Boolean).join(" ");
  const label = [
    `Route ${number}`,
    state,
    gradeLabel ? `grade ${gradeLabel}` : null,
    zone ? "zone hold reached" : null,
  ].filter(Boolean).join(", ");

  const inner = (
    <>
      {zone && (
        <span className={styles.zoneBadge}>
          <FaFlag />
        </span>
      )}
      <span className={styles.number}>{number}</span>
      {state === "flash" && (
        <span className={styles.flashBadge}>
          <FaBolt />
        </span>
      )}
      {gradeLabel && (state === "completed" || state === "flash") && (
        <span className={styles.gradeOverlay}>{gradeLabel}</span>
      )}
    </>
  );

  // Informational tiles (no `onClick`) render as a plain div — no
  // button semantics, no pointer/hover affordances. Used in places
  // like the ClimberSheet send-grid where the tiles are read-only.
  if (!onClick) {
    return (
      <div className={cls} role="img" aria-label={label} style={style}>
        {inner}
      </div>
    );
  }

  return (
    <button
      className={cls}
      onClick={onClick}
      type="button"
      aria-label={label}
      style={style}
    >
      {inner}
    </button>
  );
});
