"use client";

import type { ReactNode } from "react";
import styles from "./toggleRow.module.scss";

interface Props {
  /** Optional leading icon — typically a `react-icons/fa6` glyph. */
  icon?: ReactNode;
  /** Primary label, e.g. "Zone hold". */
  title: ReactNode;
  /** Optional secondary line below the title for context / hint copy. */
  detail?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Pass-through for cases where the parent is `<form>` and we want
   *  the underlying `<input type="checkbox">` to participate. */
  name?: string;
  disabled?: boolean;
  /** Accessible label override. Defaults to the visual `title` when
   *  the title is a string; required when title is a React node. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Labelled iOS-style toggle row. The whole row is one large tap
 * target (CLAUDE.md mandates 44×44 minimum) and the switch picks up
 * the active accent automatically.
 *
 * Use anywhere a single boolean opt-in / opt-out needs to read as a
 * polished modern control rather than a bare HTML checkbox. Reach
 * for it in admin forms, settings sheets, and per-route metadata
 * editors — the visual style is the same everywhere by design.
 *
 * The container is a `<label>` so a click anywhere on the row toggles
 * the checkbox AND screen-readers get the right "checkbox + label"
 * association.
 */
export function ToggleRow({
  icon,
  title,
  detail,
  checked,
  onChange,
  name,
  disabled,
  ariaLabel,
  className,
}: Props) {
  const computedAriaLabel =
    ariaLabel ?? (typeof title === "string" ? title : undefined);
  return (
    <label className={[styles.row, className].filter(Boolean).join(" ")}>
      <span className={styles.text}>
        {icon && (
          <span className={styles.icon} aria-hidden>
            {icon}
          </span>
        )}
        <span className={styles.labelStack}>
          <span className={styles.title}>{title}</span>
          {detail && <span className={styles.detail}>{detail}</span>}
        </span>
      </span>
      <input
        type="checkbox"
        name={name}
        className={styles.switch}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={computedAriaLabel}
      />
    </label>
  );
}
