import type { ReactNode } from "react";
import styles from "./sheetPrimitives.module.scss";

interface Props {
  children: ReactNode;
  /**
   * Button stacking direction.
   *
   *   "vertical"  (default) — buttons stack full-width, one per row.
   *                 The canonical sheet footer: primary on top,
   *                 cancel / ghost beneath. Works on any viewport
   *                 without wrapping.
   *   "horizontal" — buttons sit side-by-side with equal flex-grow.
   *                 Useful when both actions are equal-weight (e.g.
   *                 a segmented yes/no).
   */
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/**
 * Button row footer for a BottomSheet or inline confirmation.
 * Owns only the spacing + direction — consumers pass in `<Button>`s
 * (or links wrapping buttons) as children and the primitive takes
 * care of the layout.
 */
export function SheetActions({
  children,
  orientation = "vertical",
  className,
}: Props) {
  const cls = [
    styles.actions,
    orientation === "horizontal" ? styles.actionsHorizontal : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={cls}>{children}</div>;
}
