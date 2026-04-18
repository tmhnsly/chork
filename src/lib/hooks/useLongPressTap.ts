"use client";

import { useCallback, useEffect, useRef } from "react";

interface Options {
  onTap: () => void;
  onLongPress?: () => void;
  delay?: number;
}

interface PointerProps {
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  onPointerUp: React.PointerEventHandler<HTMLElement>;
  onPointerLeave: React.PointerEventHandler<HTMLElement>;
  onPointerCancel: React.PointerEventHandler<HTMLElement>;
  onClick: React.MouseEventHandler<HTMLElement>;
  onContextMenu: React.MouseEventHandler<HTMLElement>;
}

/**
 * Combine tap + long-press on a single clickable element. A held
 * pointer for `delay` ms (default 500) fires `onLongPress`; a
 * release before that fires `onTap` via the normal click event.
 * When a long-press has fired, the subsequent `click` is swallowed
 * so the element doesn't double-trigger.
 *
 * Returned props are spread onto the target (e.g. `<button {...handlers}>`).
 * `onContextMenu` is suppressed so iOS Safari's native long-press
 * callout doesn't appear over the custom gesture.
 */
export function useLongPressTap({
  onTap,
  onLongPress,
  delay = 500,
}: Options): PointerProps {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback<React.PointerEventHandler<HTMLElement>>(
    () => {
      firedRef.current = false;
      clear();
      if (!onLongPress) return;
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        timerRef.current = null;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay, clear],
  );

  const onClick = useCallback<React.MouseEventHandler<HTMLElement>>((e) => {
    if (firedRef.current) {
      firedRef.current = false;
      e.preventDefault();
      return;
    }
    onTap();
  }, [onTap]);

  const onContextMenu = useCallback<React.MouseEventHandler<HTMLElement>>(
    (e) => {
      if (onLongPress) e.preventDefault();
    },
    [onLongPress],
  );

  return {
    onPointerDown,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick,
    onContextMenu,
  };
}
