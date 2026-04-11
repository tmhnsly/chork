"use client";

import * as Switch from "@radix-ui/react-switch";
import { FaBullseye } from "react-icons/fa6";
import styles from "./zoneHoldRow.module.scss";

interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Whether attempts have been logged — controls enabled/disabled state */
  hasAttempts: boolean;
}

export function ZoneHoldRow({ checked, onCheckedChange, disabled, hasAttempts }: Props) {
  const isDisabled = disabled || !hasAttempts;

  return (
    <div className={`${styles.row} ${checked ? styles.rowOn : ""} ${isDisabled ? styles.rowDisabled : ""}`}>
      <div className={styles.label}>
        <FaBullseye className={styles.icon} />
        <span className={styles.text}>Zone hold</span>
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
          aria-label="Zone hold"
        >
          <Switch.Thumb className={styles.toggleThumb} />
        </Switch.Root>
      )}
    </div>
  );
}
