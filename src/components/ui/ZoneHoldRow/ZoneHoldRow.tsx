"use client";

import * as Switch from "@radix-ui/react-switch";
import { FaFlag } from "react-icons/fa6";
import styles from "./zoneHoldRow.module.scss";

interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Whether attempts have been logged — controls enabled/disabled state */
  hasAttempts: boolean;
  /**
   * What this row is called. A boulder has a zone hold; a rope route
   * has a highpoint. Defaults to "Zone hold" so the gym Wall — which
   * is boulders — needs no change.
   */
  label?: string;
}

export function ZoneHoldRow({
  checked,
  onCheckedChange,
  disabled,
  hasAttempts,
  label = "Zone hold",
}: Props) {
  const isDisabled = disabled || !hasAttempts;

  return (
    <div className={`${styles.row} ${checked ? styles.rowOn : ""} ${isDisabled ? styles.rowDisabled : ""}`}>
      <div className={styles.label}>
        <FaFlag className={styles.icon} />
        <span className={styles.text}>{label}</span>
      </div>
      {!hasAttempts ? (
        <span className={styles.hint}>Log an attempt first</span>
      ) : (
        <Switch.Root
          className={styles.toggle}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={isDisabled}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={label}
        >
          <Switch.Thumb className={styles.toggleThumb} />
        </Switch.Root>
      )}
    </div>
  );
}
