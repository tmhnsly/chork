import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import styles from "./iconButton.module.scss";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** What the button does — it has no visible text, so this is required. */
  label: string;
  /** The glyph. One `react-icons/fa6` icon, `aria-hidden` is applied here. */
  children: ReactNode;
}

/**
 * A round, bordered, icon-only control at touch-target size — the
 * Match screen's ⋮ menu, the profile's settings gear, a league's ⋮.
 * `IconLink` below is the same circle for a page's way back.
 *
 * One shape for "a small piece of chrome that opens something", so
 * the same glyph-in-a-circle means the same thing on every screen.
 * The profile had its own bordered square, the match its own circle;
 * a control that appears once teaches nothing.
 */
export function IconButton({ label, children, className, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`${styles.root} ${className ?? ""}`}
      aria-label={label}
      {...rest}
    >
      <span className={styles.glyph} aria-hidden>
        {children}
      </span>
    </button>
  );
}

interface LinkProps {
  href: string;
  /** Where it goes — it has no visible text, so this is required. */
  label: string;
  /** The glyph. One `react-icons/fa6` icon, `aria-hidden` is applied here. */
  children: ReactNode;
  className?: string;
}

/**
 * `IconButton`'s circle as a link: the round control for going
 * somewhere rather than opening something, which on a page means its
 * way back. Anchor semantics (middle-click, long-press preview,
 * announced as a link), same circle, same hover.
 */
export function IconLink({ href, label, children, className }: LinkProps) {
  return (
    <Link href={href} className={`${styles.root} ${className ?? ""}`} aria-label={label}>
      <span className={styles.glyph} aria-hidden>
        {children}
      </span>
    </Link>
  );
}
