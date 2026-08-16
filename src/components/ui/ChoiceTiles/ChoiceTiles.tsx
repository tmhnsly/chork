"use client";

import type { ReactNode } from "react";
import styles from "./choiceTiles.module.scss";

export interface ChoiceTileOption<T extends string> {
  value: T;
  label: string;
  /** One short line under the label. Optional — most choices don't need one. */
  detail?: string;
  /** Small glyph above the label, for choices with an established icon. */
  icon?: ReactNode;
  disabled?: boolean;
}

interface Props<T extends string> {
  options: ChoiceTileOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required — this is a radio group and needs naming. */
  ariaLabel: string;
}

/**
 * Choosing between a few things that matter, in the card's language.
 *
 * The route tile is what the app already does well: chunky, square-ish,
 * and coloured by what you did. This is that tile with a label instead
 * of a number, so picking a game mode looks like the thing the app is
 * actually about rather than like a settings row.
 *
 * NOT a replacement for `SegmentedControl`. That one is for filters —
 * This set / All time — where you're changing what you're looking at.
 * Choosing what you're going to *do* is a different act and shouldn't
 * wear the same clothes. See CLAUDE.md "The tile is the app's
 * vocabulary".
 *
 * Radios rather than buttons: one of these is always chosen, arrow
 * keys move between them, and a screen reader announces "2 of 3"
 * without any of it being hand-rolled.
 */
export function ChoiceTiles<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<T>) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            className={`${styles.tile} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && (
              <span className={styles.icon} aria-hidden>
                {opt.icon}
              </span>
            )}
            <span className={styles.label}>{opt.label}</span>
            {opt.detail && <span className={styles.detail}>{opt.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}
