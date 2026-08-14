"use client";

import { useTabList } from "./useTabList";
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
  /**
   * Id of the panel this control switches between.
   *
   * **Set it when the control drives a region of content** — the
   * control then renders the full ARIA tabs pattern and points each
   * tab at that panel. The panel must carry
   * `role="tabpanel"`, `id={panelId}`, `tabIndex={0}` and
   * `aria-labelledby={tabId(panelId, value)}`.
   *
   * **Omit it for a filter or a form choice**, which is what most
   * uses are (grading scale, achievement filter). The control then
   * renders as a toggle-button group: `role="group"` with
   * `aria-pressed` on each option. That's honest — `role="tab"`
   * without a `tabpanel` makes a screen reader announce "tab 1 of 3,
   * selected" and then offer nowhere to move to, which is what every
   * one of these surfaces used to do.
   */
  panelId?: string;
}

/**
 * Mutually exclusive options in a fixed, equal-width segmented bar.
 * The active option has a filled pill background using `--mono-bg`
 * (step 3), consistent with the navbar active tab style.
 *
 * Behaviour (roles, roving tabindex, arrow keys, tabs-vs-group) comes
 * from `useTabList` — shared with `TabPills`, which is the same widget
 * in a scrollable pill layout. Only the markup and styles differ.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  panelId,
}: Props<T>) {
  const { listProps, optionProps, isSelected } = useTabList({
    options,
    value,
    panelId,
  });

  return (
    <div
      {...listProps}
      aria-label={ariaLabel}
      className={[styles.track, className].filter(Boolean).join(" ")}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          {...optionProps(opt, i)}
          className={`${styles.option} ${isSelected(opt.value) ? styles.optionSelected : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
