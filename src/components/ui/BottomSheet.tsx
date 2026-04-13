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

    if (shouldClose) {
      // Animate the sheet the rest of the way down from its current
      // drag position. Previously we removed the `--drag-y` var first
      // and then ran the `.contentClosing` keyframe animation — which
      // snaps the element to translateY(0) before starting the close
      // slide, producing a "jumps up then down" flicker on slow drags.
      // Here we transition transform from wherever the finger left it
      // straight to fully-offscreen, then fire the close once it lands.
      const el = contentRef.current;
      const height = el.getBoundingClientRect().height || window.innerHeight;
      // Sync the overlay fade-out by flagging closing state now (the
      // overlay uses `.overlayClosing` which is fade-only, no slide,
      // so it animates cleanly regardless of the content's position).
      setClosing(true);
      el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight;
      el.classList.remove(styles.dragging);
      el.style.removeProperty("--drag-y");
      el.style.transition = "transform var(--duration-normal) var(--ease-out)";
      el.style.transform = `translateY(${Math.ceil(height + 16)}px)`;
      el.addEventListener(
        "transitionend",
        () => {
          el.style.transition = "";
          el.style.transform = "";
          onClose();
        },
        { once: true },
      );
    } else {
      // Snap back to rest position with a transition. Remove the
      // dragging class first so the stylesheet transition applies.
      contentRef.current.classList.remove(styles.dragging);
      contentRef.current.style.removeProperty("--drag-y");
      contentRef.current.style.transform = `translateY(${dy}px)`;
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
