"use client";

import { useTabList } from "./useTabList";
import styles from "./tabPills.module.scss";

export interface TabPillOption<T extends string | number | null> {
  /** Underlying value — string for normal tabs, `null` allowed for
   *  "All"-style options that represent "no filter". */
  value: T;
  label: string;
  /** Optional leading count pill (e.g. "4") rendered to the right of the label. */
  count?: number;
  disabled?: boolean;
}

interface Props<T extends string | number | null> {
  options: TabPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required for screen-reader context. */
  ariaLabel: string;
  /**
   * Layout behaviour when the row would overflow its container:
   *   • `"scroll"` (default) — pills stay on one line and the row
   *                             scrolls horizontally, matching the
   *                             canonical mobile filter-strip feel.
   *   • `"wrap"`             — pills wrap to a second line with
   *                             consistent row spacing. Use inside
   *                             `<BottomSheet subheader>` where a
   *                             scrollbar inside the sticky chrome
   *                             reads as broken.
   */
  layout?: "scroll" | "wrap";
  className?: string;
  /**
   * Id of the panel this control switches between. Set it when the
   * pills drive a region of content (the panel needs
   * `role="tabpanel"`, `id={panelId}`, `tabIndex={0}` and
   * `aria-labelledby={tabId(panelId, value)}`); omit it for a filter,
   * which is what most uses are.
   *
   * Without a panel, `role="tab"` announces "tab 1 of 4, selected"
   * and then offers nowhere to move to — so the no-panel form renders
   * a toggle-button group instead. See SegmentedControl for the full
   * reasoning; the two controls share this contract.
   */
  panelId?: string;
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
 * segmented bar instead of a scrollable pill row — same widget, same
 * behaviour (both use `useTabList`), different layout.
 */
export function TabPills<T extends string | number | null>({
  options,
  value,
  onChange,
  ariaLabel,
  layout = "scroll",
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
      className={[
        styles.row,
        layout === "wrap" ? styles.rowWrap : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((opt, i) => {
        const selected = isSelected(opt.value);
        return (
          <button
            key={String(opt.value ?? "__null")}
            {...optionProps(opt, i)}
            className={`${styles.pill} ${selected ? styles.pillActive : ""}`}
            onClick={() => onChange(opt.value)}
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
