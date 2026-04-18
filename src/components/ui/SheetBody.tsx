import type { CSSProperties, ReactNode } from "react";
import styles from "./sheetPrimitives.module.scss";
import { spaceVar, type SpaceStep } from "./spacing";

interface Props {
  children: ReactNode;
  /**
   * Vertical rhythm between direct children. Accepts a step on the
   * design-token spacing scale (1 → `--space-1`, 8 → `--space-8`);
   * omit for the default `4`. `5` suits headier sheets like climber
   * peek or set detail.
   */
  gap?: SpaceStep;
  /**
   * Extra bottom padding beyond the BottomSheet's own safe-area
   * inset. Matches the `padding-bottom: var(--space-4)` most sheets
   * used to append by hand. Pass `"none"` to skip it for sheets
   * whose last child already handles its own trailing space (e.g. a
   * scrolling list).
   */
  padBottom?: "default" | "none";
  className?: string;
}

/**
 * Inner stack for a BottomSheet's content area. Every sheet in the
 * app used to duplicate the same `@include layout.stack(...)` +
 * trailing `padding-bottom` pattern — this primitive collapses it
 * to a single component so sheet SCSS files can focus on the stuff
 * that's actually unique to that sheet.
 *
 * Pair with `<SheetActions>` for the button row at the bottom and
 * `<ConfirmInline>` for "are you sure?" confirmations.
 */
export function SheetBody({
  children,
  gap,
  padBottom = "default",
  className,
}: Props) {
  const style: CSSProperties | undefined =
    gap !== undefined
      ? ({ "--sheet-body-gap": spaceVar(gap) } as CSSProperties)
      : undefined;
  const cls = [
    styles.body,
    padBottom === "none" ? styles.bodyFlush : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}
