"use client";

import type { ReactNode, Ref } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { FaXmark } from "react-icons/fa6";
import styles from "./bottomSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Accessible name for the sheet — always written through to
   * `Dialog.Title` for AT. Visually rendered at the top **unless**
   * `titleSlot` is provided, in which case the title is kept
   * visually hidden and the slot's content occupies the chrome.
   */
  title: string;
  /** Accessible description — used for screen readers only. */
  description?: string;
  /**
   * Optional rich visual title — replaces the plain title text in
   * the sticky chrome (the close button stays on the right). The
   * accessible `title` string is still announced via a
   * visually-hidden `Dialog.Title`. Use when the sheet's "what is
   * this about" needs more than a string — e.g. a climber peek
   * sheet showing an avatar + linked name + rank chip.
   */
  titleSlot?: ReactNode;
  /**
   * Optional secondary row rendered directly under the title inside
   * the sticky chrome — filter pills, segmented tabs, meta strips.
   * Anything put here stays pinned at the top of the sheet as the
   * body scrolls underneath, so the user can re-select filters
   * without scrolling back up. Pair with `<TabPills layout="wrap">`
   * so the row has a solid structure instead of a horizontal scroll.
   */
  subheader?: ReactNode;
  /** Prevent closing when clicking outside (default: false). */
  disableOutsideClose?: boolean;
  /**
   * Ref to the sheet's scrolling element. The body doesn't scroll —
   * the panel itself does — so a sheet that swaps its own content
   * (tabs, filters) has no way to reach the scroll position without
   * this. Use it to reset to the top when the content underneath the
   * sticky chrome changes; leaving a fresh list scrolled to where the
   * last one was reads as an empty or half-loaded list.
   */
  scrollRef?: Ref<HTMLDivElement>;
  /**
   * Vertical size variant:
   *   • "default" caps at 90svh and shrinks to content below that.
   *   • "tall"    caps just below the top safe-area inset so a
   *                content-heavy sheet (RouteLogSheet with beta
   *                expanded, AchievementsSheet's full list) can use
   *                almost the full viewport.
   */
  size?: "default" | "tall";
  children: ReactNode;
}

/**
 * Bottom sheet — button-controlled only. No drag-to-close, no
 * physics library. Radix Dialog handles focus trap, ESC, overlay
 * tap and portal semantics; CSS transitions drive the slide-up
 * entrance and scale-to-content sizing.
 *
 * Dismiss paths:
 *   • Close button in the header
 *   • Tap overlay (unless `disableOutsideClose`)
 *   • ESC key
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  titleSlot,
  subheader,
  disableOutsideClose = false,
  size = "default",
  scrollRef,
  children,
}: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !disableOutsideClose) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          ref={scrollRef}
          className={[
            styles.content,
            size === "tall" ? styles.contentTall : "",
          ].filter(Boolean).join(" ")}
          onOpenAutoFocus={(e) => {
            // Radix's default grabs the first focusable (the close
            // button), which flashed a phantom keyboard-focus ring for
            // pointer users. But fully suppressing focus left screen
            // readers never announcing the sheet opened. Instead, move
            // focus to the dialog container itself: AT announces it, and
            // a non-interactive div shows no button-style ring.
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          onInteractOutside={(e) => {
            if (disableOutsideClose) e.preventDefault();
          }}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Description>{description ?? title}</Dialog.Description>
          </VisuallyHidden.Root>

          <header className={styles.titleBar}>
            <div className={styles.titleRow}>
              {titleSlot ? (
                <>
                  <VisuallyHidden.Root asChild>
                    <Dialog.Title>{title}</Dialog.Title>
                  </VisuallyHidden.Root>
                  <div className={styles.titleSlot}>{titleSlot}</div>
                </>
              ) : (
                <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              )}
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close"
              >
                <FaXmark />
              </button>
            </div>
            {subheader && <div className={styles.subheader}>{subheader}</div>}
          </header>

          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
