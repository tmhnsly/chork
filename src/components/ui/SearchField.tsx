"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import styles from "./searchField.module.scss";

/**
 * Shared search-field primitive: `input.field` styling with a
 * magnifying-glass glyph absolutely positioned on the left and the
 * text generously inset so the icon never kisses the query.
 *
 * Two flavours:
 *   • Live input — used inside sheets where the user types and
 *     results update in place (CrewSearchSheet).
 *   • `asButton` — a styled tap target that opens a sheet. Matches
 *     the input visually so both call-sites read as the same thing.
 */

interface BaseProps {
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

interface ButtonFieldProps extends BaseProps {
  asButton: true;
  onClick: () => void;
}

interface InputFieldProps
  extends BaseProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder" | "className"> {
  asButton?: false;
}

type Props = ButtonFieldProps | InputFieldProps;

export const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField(
  props,
  ref,
) {
  if (props.asButton) {
    const { placeholder = "Search", onClick, className, ariaLabel } = props;
    return (
      <button
        type="button"
        className={`${styles.wrap} ${styles.wrapButton} ${className ?? ""}`}
        onClick={onClick}
        aria-label={ariaLabel ?? placeholder}
      >
        <FaMagnifyingGlass className={styles.icon} aria-hidden />
        <span className={styles.placeholder}>{placeholder}</span>
      </button>
    );
  }

  const { placeholder = "Search", className, ariaLabel, ...rest } = props;
  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <FaMagnifyingGlass className={styles.icon} aria-hidden />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        className={styles.input}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        // Discourage password managers from treating this as a login
        // field. The biggest single signal they use is the placeholder
        // text (an `@` in the placeholder reads as "email" to iCloud
        // Passwords) — consumers should keep placeholders free of
        // email-ish hints.
        name="search"
        autoComplete="off"
        autoCorrect="off"
        // Spec-valid `autocapitalize` values are none/sentences/words/
        // characters — browsers normalise "off" to "none" on the DOM,
        // causing a hydration mismatch against SSR. Use "none" directly.
        autoCapitalize="none"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        {...rest}
      />
    </div>
  );
});
