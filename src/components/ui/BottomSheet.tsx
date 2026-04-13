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

const DRAG_CLOSE_THRESHOLD = 60; // px
const DRAG_VELOCITY_THRESHOLD = 0.4; // px/ms

/**
 * Bottom sheet with drag-to-dismiss. Wraps Radix Dialog with a swipe-
 * down gesture on the handle.
 *
 * Open / tap-close use CSS keyframes (`.content` / `.contentClosing`).
 * Drag uses inline transform via `--drag-y` + a `.dragging` class
 * that turns the transition off so finger-tracking is 1:1.
 *
 * Drag-close is a dedicated path: when the user releases past the
 * close threshold we animate the sheet the rest of the way down
 * from its current drag offset using an inline transform transition,
 * then fire `onClose` on `transitionend`. We deliberately do NOT
 * toggle `.contentClosing` in that case — its keyframe starts from
 * `translateY(0)` and would snap the sheet up before sliding down,
 * producing a visible "pop up then down" flicker.
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
  const dragRef = useRef({ startY: 0, startTime: 0, dragging: false });

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
    try {
      contentRef.current.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture may already be released — ignore
    }

    const dy = e.clientY - dragRef.current.startY;
    const elapsed = Date.now() - dragRef.current.startTime;
    const velocity = elapsed > 0 ? dy / elapsed : 0;
    const shouldClose = dy > DRAG_CLOSE_THRESHOLD || velocity > DRAG_VELOCITY_THRESHOLD;
    const el = contentRef.current;

    // Pin animation to none inline BEFORE removing the `.dragging`
    // class. Otherwise, swapping from `.dragging`'s `animation: none
    // !important` back to `.content`'s `animation: sheetSlideUp`
    // registers as a new animation assignment and the browser
    // replays the slide-up keyframe (translateY(100%) → 0) — which
    // is the source of the "pop up then down" flicker.
    el.style.animation = "none";
    el.style.transform = `translateY(${dy}px)`;
    void el.offsetHeight;
    el.classList.remove(styles.dragging);
    el.style.removeProperty("--drag-y");
    el.style.transition = "transform var(--duration-normal) var(--ease-out)";

    if (shouldClose) {
      const height = el.getBoundingClientRect().height || window.innerHeight;
      el.style.transform = `translateY(${Math.ceil(height + 16)}px)`;
      const onEnd = () => {
        el.removeEventListener("transitionend", onEnd);
        el.style.transition = "";
        el.style.transform = "";
        el.style.animation = "";
        onClose();
      };
      el.addEventListener("transitionend", onEnd);
    } else {
      el.style.transform = "translateY(0)";
      const onEnd = () => {
        el.removeEventListener("transitionend", onEnd);
        el.style.transition = "";
        el.style.transform = "";
        el.style.animation = "";
      };
      el.addEventListener("transitionend", onEnd);
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
          onAnimationEnd={(e) => {
            // `onAnimationEnd` bubbles — any child whose animation
            // finishes during the close window (shimmer, count-up,
            // reveal-in) would otherwise fire `onClose()` too early,
            // re-mounting the sheet mid-slide. Gate on the event
            // coming from the content element itself.
            if (closing && e.target === e.currentTarget) onClose();
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
