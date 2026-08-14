"use client";

import { useRef } from "react";
import { tabId } from "./tab-ids";
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
 * Mutually exclusive options in a segmented bar.
 *
 * Two ARIA shapes behind one visual — see `panelId`. Arrow-key roving
 * focus applies only in tabs mode: in group mode every button is
 * Tab-reachable, because a toggle group isn't a composite widget and
 * roving tabindex would hide options from keyboard users.
 *
 * Activation is manual in tabs mode (focus moves on arrow, selection
 * on Enter/Space/click) per the WAI-ARIA recommendation, so keyboard
 * users don't fire a fetch on every arrow press.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  panelId,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const asTabs = panelId !== undefined;

  function handleKeyDown(e: React.KeyboardEvent, i: number) {
    if (!asTabs) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (i + dir + options.length) % options.length;
    refs.current[next]?.focus();
  }

  return (
    <div
      role={asTabs ? "tablist" : "group"}
      aria-label={ariaLabel}
      className={[styles.track, className].filter(Boolean).join(" ")}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role={asTabs ? "tab" : undefined}
            id={asTabs ? tabId(panelId, opt.value) : undefined}
            aria-selected={asTabs ? selected : undefined}
            aria-controls={asTabs ? panelId : undefined}
            aria-pressed={asTabs ? undefined : selected}
            tabIndex={asTabs ? (selected ? 0 : -1) : undefined}
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
