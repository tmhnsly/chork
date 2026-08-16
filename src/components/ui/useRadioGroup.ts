"use client";

import { useRef } from "react";

/**
 * The ARIA + keyboard contract shared by `GradePicker` and
 * `ChoiceTiles`.
 *
 * Both had written `role="radiogroup"` with `role="radio"` children and
 * stopped there — no roving tabindex, no key handler. A radiogroup that
 * ignores the arrows is worse than plain buttons, because the roles
 * promise a screen-reader user a composite widget that isn't there;
 * `ChoiceTiles` went as far as claiming arrow keys in its own doc
 * comment. Fixing it in one of them and not the other was how it
 * happened the first time, so the behaviour lives here.
 *
 * This is deliberately NOT `useTabList`, which covers the other two
 * shapes: tabs (arrows move focus, you activate yourself) and toggle
 * groups (every button tabbable, no arrows). A radiogroup is the third
 * contract — one tab stop for the whole set, and arrows *select* as
 * they move, per the ARIA pattern's automatic activation.
 *
 * Both axes are handled. These groups wrap onto several lines once the
 * scale is long enough, and at that point up/down is as natural a reach
 * as left/right.
 */
export function useRadioGroup<T>({
  options,
  value,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  required = false,
  disabled = false,
}: {
  options: readonly { value: T; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group. Give this OR `ariaLabelledBy`, never both. */
  ariaLabel?: string;
  /**
   * Id of a visible label. Prefer it over `ariaLabel` when the label is
   * already on screen — an `aria-label` alongside it makes a screen
   * reader announce the same words twice.
   */
  ariaLabelledBy?: string;
  /** Marks the group as needing an answer before the form can submit. */
  required?: boolean;
  /** Disables every option at once, e.g. behind a toggle. */
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // The set's single tab stop: the selected option, or the first one
  // that can take focus when nothing is selected yet — otherwise a
  // group with no selection is unreachable by keyboard entirely.
  const selectedIndex = options.findIndex((o) => o.value === value);
  const focusIndex =
    selectedIndex >= 0
      ? selectedIndex
      : Math.max(0, options.findIndex((o) => !o.disabled));

  function handleKeyDown(e: React.KeyboardEvent, i: number) {
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    if (!back && !forward) return;
    e.preventDefault();

    const dir = forward ? 1 : -1;
    const len = options.length;
    let j = i;
    // Skip disabled options so focus never lands on one.
    for (let step = 0; step < len; step++) {
      j = (j + dir + len) % len;
      if (!options[j]?.disabled) break;
    }
    if (j === i) return;

    refs.current[j]?.focus();
    onChange(options[j].value);
  }

  return {
    /** Spread onto the container element. */
    groupProps: {
      role: "radiogroup" as const,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      "aria-required": required || undefined,
    },
    /** Spread onto each option button. */
    optionProps: (opt: { value: T; disabled?: boolean }, i: number) => ({
      ref: (el: HTMLButtonElement | null) => {
        refs.current[i] = el;
      },
      type: "button" as const,
      role: "radio" as const,
      "aria-checked": opt.value === value,
      tabIndex: i === focusIndex ? 0 : -1,
      disabled: disabled || opt.disabled,
      onClick: () => onChange(opt.value),
      onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, i),
    }),
  };
}
