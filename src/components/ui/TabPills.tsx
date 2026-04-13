"use client";

import { useRef } from "react";
import styles from "./tabPills.module.scss";

export interface TabPillOption<T extends string | null> {
  /** Underlying value — string for normal tabs, `null` allowed for
   *  "All"-style options that represent "no filter". */
  value: T;
  label: string;
  /** Optional leading count pill (e.g. "4") rendered to the right of the label. */
  count?: number;
  disabled?: boolean;
}

interface Props<T extends string | null> {
  options: TabPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required for screen-reader context. */
  ariaLabel: string;
  className?: string;
}

/**
 * Horizontal-scrolling row of pill tabs. The canonical look for
 * filter rows throughout the app: achievements categories, crew
 * picker, competition category filter, etc.
 *
 * Implements the ARIA tablist pattern with arrow-key navigation.
 * Focus moves with Left/Right; activation is manual (Enter / Space /
 * click) — matches WAI-ARIA's "manual activation" recommendation so
 * keyboard users don't trigger network fetches on every arrow press.
 *
 * Pair with `SegmentedControl` when you want a fixed equal-width
 * segmented bar instead of a scrollable pill row.
 */
export function TabPills<T extends string | null>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const len = options.length;
    let j = i;
    // Skip disabled options so Tab focus never lands on them.
    for (let step = 0; step < len; step++) {
      j = (j + dir + len) % len;
      if (!options[j]?.disabled) break;
    }
    refs.current[j]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[styles.row, className].filter(Boolean).join(" ")}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value ?? "__null")}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            className={`${styles.pill} ${selected ? styles.pillActive : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span className={styles.count} aria-hidden>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
