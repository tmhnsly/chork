"use client";

import { memo } from "react";
import { FaBolt, FaBullseye } from "react-icons/fa6";
import type { TileState } from "@/lib/data";
import styles from "./punchTile.module.scss";

interface Props {
  number: number;
  state: TileState;
  zone?: boolean;
  onClick?: () => void;
  className?: string;
  /** Remove min-size constraints for display-only contexts */
  compact?: boolean;
}

export const PunchTile = memo(function PunchTile({ number, state, zone, onClick, className, compact }: Props) {
  return (
    <button
      className={[styles.tile, styles[state], compact && styles.compact, className].filter(Boolean).join(" ")}
      onClick={onClick}
      type="button"
      aria-label={`Route ${number}, ${state}`}
    >
      {zone && (
        <span className={styles.zoneBadge}>
          <FaBullseye />
        </span>
      )}
      <span className={styles.number}>
        {number}
      </span>
      {state === "flash" && (
        <span className={styles.flashBadge}>
          <FaBolt />
        </span>
      )}
    </button>
  );
});
