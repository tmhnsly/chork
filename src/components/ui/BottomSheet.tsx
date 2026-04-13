"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { FaXmark } from "react-icons/fa6";
import styles from "./bottomSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Title rendered visibly at the top of the sheet (also used as the
   * accessible `Dialog.Title`).
   */
  title: string;
  /** Accessible description — used for screen readers only. */
  description?: string;
  /** Prevent closing when clicking outside (default: false). */
  disableOutsideClose?: boolean;
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
  disableOutsideClose = false,
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
          className={styles.content}
          onOpenAutoFocus={(e) => {
            // Prevent Radix's default first-focusable grab — it
            // caused a phantom keyboard-focus ring on the close
            // button every time a pointer user tapped to open.
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (disableOutsideClose) e.preventDefault();
          }}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Description>{description ?? title}</Dialog.Description>
          </VisuallyHidden.Root>

          <header className={styles.titleBar}>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
