"use client";

import type { ButtonHTMLAttributes } from "react";
import { FaSpinner } from "react-icons/fa6";
import styles from "./ui.module.scss";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  flex?: boolean;
  /**
   * Show a spinner in place of the label while an action is in
   * flight. Implies `disabled` — a button mid-submit must not be
   * pressable again.
   *
   * The label stays in the DOM with `visibility: hidden` and the
   * spinner is overlaid on top, so the button keeps the exact width
   * it had before. Swapping the text for "Loading..." — what the
   * sign-in form did — resizes any button that isn't full-width and
   * shoves whatever sits beside it, at the precise moment the user
   * is watching to see whether their tap registered.
   */
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
  danger: styles.btnDanger,
};

export function Button({
  variant = "primary",
  fullWidth,
  flex,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: Props) {
  const cls = [
    variantClass[variant],
    fullWidth && styles.btnFull,
    flex && styles.btnFlex1,
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      className={cls}
      // `||`, not `??` — an explicit `disabled={false}` from the
      // caller must not re-enable a button that's mid-submit.
      disabled={disabled || loading}
      // The label is still readable to AT (visibility:hidden hides it,
      // but it's replaced in the a11y tree by nothing else), so
      // `aria-busy` is what tells a screen reader the control is
      // working rather than simply unavailable.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className={styles.btnLabelHidden}>{children}</span>
          <span className={styles.btnSpinner} aria-hidden="true">
            <FaSpinner />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
