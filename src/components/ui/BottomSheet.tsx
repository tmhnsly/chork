"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import styles from "./bottomSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accessible title — rendered visually hidden for screen readers */
  title: string;
  /** Accessible description — provides context beyond the title */
  description?: string;
  /** Prevent closing when clicking outside (default: false) */
  disableOutsideClose?: boolean;
  /** Prevent drag-to-close gesture (default: false) */
  disableDrag?: boolean;
  children: ReactNode;
}

const DRAG_CLOSE_THRESHOLD = 60;     // px
const DRAG_VELOCITY_THRESHOLD = 0.4; // px/ms

interface DragState {
  startY: number;
  startTime: number;
  dragging: boolean;
}

/**
 * Bottom sheet with drag-to-dismiss. Wraps Radix Dialog with a swipe-down
 * gesture on the handle. Shared primitive — consume from feature sheets
 * (RouteLogSheet, ClimberSheet, etc.) rather than importing one sheet
 * into another.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  disableOutsideClose = false,
  disableDrag = false,
  children,
}: Props) {
  const [closing, setClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState>({ startY: 0, startTime: 0, dragging: false });

  // Reset closing state when opening again (deferred to avoid sync setState-in-effect)
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

  function handleDragStart(e: React.PointerEvent) {
    if (disableDrag) return;
    const target = e.target as HTMLElement;
    if (!target.closest(`.${styles.handleBtn}`)) return;
    dragRef.current = { startY: e.clientY, startTime: Date.now(), dragging: true };
    contentRef.current?.setPointerCapture(e.pointerId);
    if (contentRef.current) {
      contentRef.current.style.setProperty("--drag-y", "0px");
      contentRef.current.classList.add(styles.dragging);
    }
  }

  function handleDragMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging || !contentRef.current) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    contentRef.current.style.setProperty("--drag-y", `${dy}px`);
  }

  function handleDragEnd(e: React.PointerEvent) {
    if (!dragRef.current.dragging || !contentRef.current) return;
    dragRef.current.dragging = false;
    contentRef.current.releasePointerCapture(e.pointerId);
    const dy = e.clientY - dragRef.current.startY;
    const elapsed = Date.now() - dragRef.current.startTime;
    const velocity = elapsed > 0 ? dy / elapsed : 0;

    const shouldClose = dy > DRAG_CLOSE_THRESHOLD || velocity > DRAG_VELOCITY_THRESHOLD;

    // Remove the dragging class (restores animation/transition from stylesheet)
    contentRef.current.classList.remove(styles.dragging);
    contentRef.current.style.removeProperty("--drag-y");

    if (shouldClose) {
      // Kick off the close flow — the slideDown animation is applied via
      // .contentClosing class. Do NOT set inline `animation: none` here —
      // that would override the stylesheet and the animation wouldn't run,
      // meaning onAnimationEnd never fires and the sheet stays open.
      startClose();
    } else {
      // Snap back to rest position with a transition
      contentRef.current.style.transform = `translateY(${dy}px)`;
      // Force reflow so the transition sees the starting position
      void contentRef.current.offsetHeight;
      contentRef.current.style.transition = "transform var(--duration-normal) var(--ease-out)";
      contentRef.current.style.transform = "translateY(0)";
      contentRef.current.addEventListener(
        "transitionend",
        () => {
          if (contentRef.current) {
            contentRef.current.style.transition = "";
            contentRef.current.style.transform = "";
          }
        },
        { once: true }
      );
    }
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
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onAnimationEnd={() => {
            if (closing) onClose();
          }}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>{title}</Dialog.Title>
          </VisuallyHidden.Root>
          <VisuallyHidden.Root asChild>
            <Dialog.Description>{description ?? title}</Dialog.Description>
          </VisuallyHidden.Root>

          <button
            ref={closeBtnRef}
            type="button"
            className={styles.handleBtn}
            onClick={startClose}
            aria-label="Close"
          >
            <div className={styles.handle} />
          </button>

          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
