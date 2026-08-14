"use client";

import { useRef } from "react";
import { tabId } from "./tab-ids";

/**
 * The ARIA + keyboard contract shared by `SegmentedControl` and
 * `TabPills`.
 *
 * The two are the same widget wearing different clothes — a fixed
 * equal-width track vs a scrollable pill row — and the difference is
 * entirely CSS. Keeping two copies of the roles, the roving tabindex,
 * the arrow-key handler and the tabs-vs-group branching meant every
 * correctness fix had to be made twice, correctly, forever. (The
 * tabs-vs-group split was itself added to both at once; that was the
 * prompt for this.)
 *
 * So the behaviour lives here and the two components keep only their
 * markup and styles.
 *
 * Modes, driven by `panelId` — see SegmentedControl's prop docs for
 * the full reasoning:
 *   • given    → real tabs: tablist/tab, aria-controls, per-tab ids,
 *                roving tabindex, arrow-key focus, manual activation.
 *   • omitted  → toggle group: role="group" + aria-pressed, every
 *                button Tab-reachable, no arrow handling.
 */
export function useTabList<T extends string | number | null>({
  options,
  value,
  panelId,
}: {
  options: readonly { value: T; disabled?: boolean }[];
  value: T;
  panelId?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const asTabs = panelId !== undefined;

  function handleKeyDown(e: React.KeyboardEvent, i: number) {
    // Arrow keys are a composite-widget affordance. In group mode the
    // buttons are individually tabbable, so hijacking arrows there
    // would fight the browser rather than help.
    if (!asTabs) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    // Move focus only — the user activates with Enter/Space or click
    // (manual activation, per the WAI-ARIA tabs pattern). Selecting on
    // arrow would fire a fetch on every keypress.
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const len = options.length;
    let j = i;
    // Skip disabled options so focus never lands on one.
    for (let step = 0; step < len; step++) {
      j = (j + dir + len) % len;
      if (!options[j]?.disabled) break;
    }
    refs.current[j]?.focus();
  }

  return {
    /** Spread onto the container element. */
    listProps: { role: asTabs ? ("tablist" as const) : ("group" as const) },
    isSelected: (optValue: T) => optValue === value,
    /** Spread onto each option button. */
    optionProps: (opt: { value: T; disabled?: boolean }, i: number) => {
      const selected = opt.value === value;
      return {
        ref: (el: HTMLButtonElement | null) => { refs.current[i] = el; },
        type: "button" as const,
        role: asTabs ? ("tab" as const) : undefined,
        id: asTabs ? tabId(panelId, opt.value) : undefined,
        "aria-selected": asTabs ? selected : undefined,
        "aria-controls": asTabs ? panelId : undefined,
        "aria-pressed": asTabs ? undefined : selected,
        tabIndex: asTabs ? (selected ? 0 : -1) : undefined,
        disabled: opt.disabled,
        onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, i),
      };
    },
  };
}
