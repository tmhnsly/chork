"use client";

import { useRef } from "react";
import styles from "./segmentedControl.module.scss";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Accessible segmented control — a group of mutually exclusive options.
 * Implements the tablist pattern with arrow-key navigation. The active
 * option has a filled pill background using `--mono-bg` (step 3),
 * consistent with the navbar active tab style.
 */
export function SegmentedControl<T extends string>({
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
    // Move focus only — user activates with Enter/Space or click (manual
    // activation per ARIA tablist pattern). Avoids firing onChange on every
    // keypress, which would trigger a server fetch per arrow press.
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (i + dir + options.length) % options.length;
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[styles.track, className].filter(Boolean).join(" ")}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
