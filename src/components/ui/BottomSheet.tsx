"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { FaXmark } from "react-icons/fa6";
import styles from "./bottomSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Title rendered visibly at the top of the sheet (also used as the
   * accessible `Dialog.Title`). Every sheet surfaces a title so the
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
 * Bottom sheet.
 *
 * Layout:
 *
 *   +---------------------------+
 *   |  Title            [ × ]   |  sticky title bar
 *   +---------------------------+
 *   |                           |
 *   |  children …               |  scrollable body
 *   |                           |
 *   +---------------------------+
 *
 * The title bar is `position: sticky; top: 0` inside the same
 * scroll container as the content, so long content scrolls under
 * it while the close button stays reachable. Dismiss via:
 *   • Close button in the header
 *   • Overlay tap (unless `disableOutsideClose`)
 *   • ESC (Radix handles this)
 *
 * Enter / exit use CSS keyframes (`.content` / `.contentClosing`).
 * No drag-to-dismiss — the close button is the intended affordance.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  disableOutsideClose = false,
  children,
}: Props) {
  const [closing, setClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Reset closing state when opening again.
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setClosing(false));
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  function startClose() {
    if (closing) return;
    setClosing(true);
  }

  if (!open) return null;

  return (
    <Dialog.Root
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !disableOutsideClose) startClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={`${styles.overlay} ${closing ? styles.overlayClosing : ""}`}
          onClick={disableOutsideClose ? undefined : startClose}
        />
        <Dialog.Content
          ref={contentRef}
          className={`${styles.content} ${closing ? styles.contentClosing : ""}`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            closeBtnRef.current?.focus();
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onAnimationEnd={(e) => {
            // `onAnimationEnd` bubbles — any child whose animation
            // finishes during the close window (shimmer, reveal text)
            // would otherwise fire `onClose()` too early. Gate on
            // the event coming from the content element itself.
            if (closing && e.target === e.currentTarget) onClose();
          }}
        >
          <header className={styles.titleBar}>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <button
              ref={closeBtnRef}
              type="button"
              className={styles.closeBtn}
              onClick={startClose}
              aria-label="Close"
            >
              <FaXmark />
            </button>
          </header>

          <VisuallyHidden.Root asChild>
            <Dialog.Description>{description ?? title}</Dialog.Description>
          </VisuallyHidden.Root>

          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
