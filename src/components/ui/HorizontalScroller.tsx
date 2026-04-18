"use client";

import type { CSSProperties, ReactNode } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import styles from "./horizontalScroller.module.scss";
import { contentVar, spaceVar, type ContentWidth, type SpaceStep } from "./spacing";

interface Props {
  children: ReactNode;
  /**
   * Accessible label for the scroll region — announced by screen
   * readers when focus enters the viewport. Mirrors the shelf's
   * section heading where possible (e.g. "Achievements").
   */
  ariaLabel?: string;
  /**
   * Gap between items on the spacing scale (1 → `--space-1`, 8 →
   * `--space-8`). Defaults to `3`.
   */
  gap?: SpaceStep;
  /**
   * Cap the inner content alignment at this page-column width. The
   * scroller runs edge-to-edge of the viewport (via `layout.bleed-x`)
   * but the first + last item align to the surrounding page column's
   * gutter so they read flush with body copy. Defaults to `"app"`
   * (the wall + profile column); pass `"wide"` for admin dashboards
   * or `"prose"` for long-form pages.
   */
  alignTo?: ContentWidth;
  /**
   * Subtract this much from the track's edge padding so the first +
   * last item's *visual* content (not their flex box) line up with
   * the surrounding page column.
   *
   * Use when an item has internal centering — e.g. a 4.5rem BadgeShelf
   * slot containing a 3.5rem circle leaves a 0.5rem inset each side,
   * which without this offset reads as the row starting 0.5rem right
   * of the heading above. For that shelf, `alignOffset={2}` pulls the
   * circle flush with the page gutter.
   */
  alignOffset?: SpaceStep;
  /**
   * Soft-fade the left + right edges of the scroller across the
   * page gutter width. Items appear to emerge from / retreat into
   * the margin, so the "is this aligned?" question disappears for
   * rows with internally-centered items (badge circles, avatar
   * stacks) and mid-scroll overflow reads as deliberate rather
   * than clipped.
   */
  edgeFade?: boolean;
  className?: string;
}

/**
 * Edge-to-edge horizontal scroller. Bleeds past the parent page's
 * gutter so swipe gestures reach the viewport edges; items inside
 * remain aligned with the page's content column via matching
 * padding. Uses Radix ScrollArea so desktop users get a styled
 * scrollbar on hover + keyboard scroll support, while mobile gets
 * native touch momentum and a hidden scrollbar.
 *
 * Use for any horizontal row of cards / tiles that should read
 * aligned-to-content on first paint but unfurl to viewport edges
 * on swipe — achievements shelf, crew member rows, route tag
 * chips, future jams history strips.
 *
 * Mount the scroller as a direct child of a `layout.page`-wrapped
 * `<main>` so `bleed-x` can compute the correct negative margin
 * from the parent's content box. Nesting deeper works but may
 * leave a narrower bleed on extreme viewports.
 */
export function HorizontalScroller({
  children,
  ariaLabel,
  gap,
  alignTo,
  alignOffset,
  edgeFade = false,
  className,
}: Props) {
  // CSS custom-property passthrough — cast once at the boundary so
  // the rest of the file stays typed. Chork treats this narrow
  // escape hatch (per CLAUDE.md) as the one allowed use of inline
  // style: piping a dynamic value into a SCSS-owned rule.
  const style: CSSProperties = {
    ...(gap !== undefined
      ? ({ "--scroller-gap": spaceVar(gap) } as CSSProperties)
      : null),
    ...(alignTo !== undefined
      ? ({ "--scroller-align": contentVar(alignTo) } as CSSProperties)
      : null),
    ...(alignOffset !== undefined
      ? ({ "--scroller-align-offset": spaceVar(alignOffset) } as CSSProperties)
      : null),
  };

  return (
    <ScrollArea.Root
      className={[
        styles.root,
        edgeFade ? styles.rootFade : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      type="hover"
      scrollHideDelay={500}
      style={style}
    >
      <ScrollArea.Viewport className={styles.viewport} aria-label={ariaLabel}>
        <div className={styles.track}>{children}</div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        className={styles.scrollbar}
        orientation="horizontal"
      >
        <ScrollArea.Thumb className={styles.thumb} />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
