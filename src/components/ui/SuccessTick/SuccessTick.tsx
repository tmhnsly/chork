import { FaCheck } from "react-icons/fa6";
import styles from "./successTick.module.scss";

interface Props {
  /**
   * `hero` — the 5rem mark at the top of a confirmation screen.
   * `inline` — the small earned marker that sits in a row.
   */
  size?: "hero" | "inline";
  /**
   * Announced to a screen reader. Omit and the tick is decorative,
   * which is right when the heading beside it already says the thing
   * — "Check your inbox" does not need "success" read out first.
   */
  label?: string;
  className?: string;
}

/**
 * The "that worked" mark: an accent disc with a tick in it.
 *
 * Two places draw this and they had drifted. The achievements detail
 * sheet got it right — `--accent-solid` behind `--accent-on-solid`,
 * which is the rule for anything sitting on an accent fill (CLAUDE.md,
 * Radix scale discipline). The login confirmation screen did not, in
 * two ways at once:
 *
 *   • It used `FaCircleCheck`, which is a FILLED CIRCLE glyph with the
 *     tick knocked out of it — so `color` paints the whole disc rather
 *     than the tick, and you get a solid blob sitting on the lime
 *     circle behind it instead of a checkmark.
 *   • It coloured that with `--mono-text`, reasoning that the mark
 *     should flip with light/dark. On an accent fill it must not:
 *     `--mono-text` is near-white in dark mode, so the blob was
 *     white-on-lime and the tick was invisible.
 *
 * `--accent-on-solid` is the pairing Radix computes for exactly this,
 * and it is correct in both themes without a `.dark` override — which
 * is the point of the token.
 */
export function SuccessTick({ size = "hero", label, className }: Props) {
  return (
    <span
      className={[styles.tick, styles[size], className].filter(Boolean).join(" ")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <FaCheck />
    </span>
  );
}
