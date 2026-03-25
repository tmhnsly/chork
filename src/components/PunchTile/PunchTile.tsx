"use client";

import { FaBolt, FaBullseye } from "react-icons/fa6";
import type { TileState } from "@/lib/data";
import styles from "./punchTile.module.scss";

interface Props {
  number: number;
  state: TileState;
  zone?: boolean;
  onClick?: () => void;
}

export function PunchTile({ number, state, zone, onClick }: Props) {
  return (
    <button
      className={`${styles.tile} ${styles[state]}`}
      onClick={onClick}
      type="button"
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
}
