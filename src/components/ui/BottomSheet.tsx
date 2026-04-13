"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { FaXmark } from "react-icons/fa6";
import styles from "./bottomSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Title rendered visibly at the top of the sheet (also used as the
   * accessible `Drawer.Title`). Every sheet surfaces a title so the
   * close button has a natural partner to line up with.
   */
  title: string;
  /** Accessible description — used for screen readers only. */
  description?: string;
  /** Prevent closing when clicking outside (default: false). */
  disableOutsideClose?: boolean;
  children: ReactNode;
}

/**
 * Bottom sheet — implemented on top of `vaul` for iOS-native physics:
 * drag-to-close, spring-back on short drags, scroll-coupling so the
 * sheet only drags after inner scroll reaches the top, backdrop
 * fades in lockstep with the drag. Vaul wraps Radix Dialog under
 * the hood so we still get focus trapping, ESC close and portal
 * semantics for free.
 *
 * Layout:
 *
 *   +---------------------------+
 *   |  Title            [ × ]   |  sticky title bar (glass)
 *   +---------------------------+
 *   |                           |
 *   |  children …               |  scrollable body
 *   |                           |
 *   +---------------------------+
 *
 * The whole sheet is one vertical scroll container. The title bar
 * is `position: sticky; top: 0` so long content scrolls *under* it
 * — that's what gives the glass backdrop something to blur.
 *
 * Dismiss paths:
 *   • Close button in the header
 *   • Drag the sheet down past a threshold
 *   • Tap overlay (unless `disableOutsideClose`)
 *   • ESC key
 *
 * Public API is unchanged from the previous Radix-only implementation
 * so consumers don't have to migrate.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  disableOutsideClose = false,
  children,
}: Props) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !disableOutsideClose) onClose();
      }}
      // `dismissible={!disableOutsideClose}` maps the prop to vaul's
      // native flag — when false, drag-to-close and overlay-tap are
      // both disabled, matching the previous behaviour.
      dismissible={!disableOutsideClose}
      // Trigger close animation smoothly; vaul handles spring-back.
      shouldScaleBackground={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content
          className={styles.content}
          onOpenAutoFocus={(e) => {
            // Prevent Radix's default "focus the first focusable
            // element" behaviour — on mobile sheets that caused a
            // visible keyboard-focus ring to appear on the close
            // button every time a user tapped to open, which reads
            // as a phantom outline. Focus stays on whatever the
            // user had focused before the sheet opened (usually
            // body), and keyboard users can Tab into the sheet
            // naturally.
            e.preventDefault();
          }}
          // Prevent vaul's default scrollbar-style layout shift. We
          // already paint our own scroll inside the sheet.
          data-chork-bottom-sheet
        >
          <VisuallyHidden.Root asChild>
            <Drawer.Description>{description ?? title}</Drawer.Description>
          </VisuallyHidden.Root>

          <header className={styles.titleBar}>
            <Drawer.Title className={styles.title}>{title}</Drawer.Title>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <FaXmark />
            </button>
          </header>

          <div className={styles.body}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
