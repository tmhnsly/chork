"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { flipOffset, localPlace, parseTranslate, type Point } from "@/lib/flip";

/**
 * FLIP for elements that change place when `dep` changes.
 *
 * Every `[data-flip-key]` inside `ref` is measured after each commit;
 * one whose box moved is held where it was last drawn (`--flip-x` /
 * `--flip-y`, transitions off for one frame) and then released, so the
 * CSS transition on the element carries it to its new place. The
 * stylesheet owns the motion:
 *
 *   [data-flip-key] {
 *     translate: var(--flip-x, 0px) var(--flip-y, 0px);
 *     transition: translate var(--duration-normal) var(--ease-out);
 *   }
 *   [data-flip="hold"] { transition: none; }
 *
 * The individual `translate` property, not `transform`: an element
 * with an animation on `transform` (an entrance with fill-mode both)
 * would own that property for good, and the offset would never show.
 *
 * While anything is travelling the hook samples where each element is
 * DRAWN every frame, so a change that lands mid-move starts from where
 * the element actually is — re-inserting a moved node cancels its
 * transition, and starting from its old destination instead was a
 * visible jump. Geometry (container-relative, zoom-corrected) lives in
 * `src/lib/flip.ts`.
 *
 * `anchor` is the edge a moved element is held by. Top by default;
 * `bottom` for things standing on a shared floor (a podium's
 * columns), whose height changes with their place — held by the top,
 * a column that grew would be pushed down through the floor while it
 * travelled.
 */
export function useFlip(
  ref: RefObject<HTMLElement | null>,
  dep: unknown,
  anchor: "top" | "bottom" = "top",
): void {
  const drawn = useRef<Map<string, Point>>(new Map());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const measure = () => {
      const origin = root.getBoundingClientRect();
      // Screen px per local px: 1.2 inside the zoomed desktop device.
      const scale = root.offsetWidth > 0 ? origin.width / root.offsetWidth : 1;
      return Array.from(root.querySelectorAll<HTMLElement>("[data-flip-key]")).flatMap((el) => {
        const key = el.dataset.flipKey;
        if (!key) return [];
        const translate = parseTranslate(getComputedStyle(el).translate);
        return [{ el, key, ...localPlace(el.getBoundingClientRect(), origin, scale, translate, anchor) }];
      });
    };

    const moved = measure().flatMap((m) => {
      const off = flipOffset(drawn.current.get(m.key), m.layout);
      return off ? [{ el: m.el, off }] : [];
    });
    for (const { el, off } of moved) {
      el.dataset.flip = "hold";
      el.style.setProperty("--flip-x", `${off.x}px`);
      el.style.setProperty("--flip-y", `${off.y}px`);
    }
    if (moved.length > 0) {
      // Commit the held offset before releasing it, or the browser
      // coalesces both writes and nothing transitions.
      void root.offsetWidth;
      for (const { el } of moved) {
        delete el.dataset.flip;
        el.style.setProperty("--flip-x", "0px");
        el.style.setProperty("--flip-y", "0px");
      }
    }

    // Sample drawn positions now, then every frame while anything is
    // still travelling; once everything has landed, stop.
    let raf = 0;
    const tick = () => {
      raf = 0;
      let travelling = false;
      for (const m of measure()) {
        drawn.current.set(m.key, m.drawn);
        if (Math.abs(m.drawn.x - m.layout.x) > 0.5 || Math.abs(m.drawn.y - m.layout.y) > 0.5) travelling = true;
      }
      if (travelling) raf = requestAnimationFrame(tick);
    };
    tick();
    // A resize while idle moves everything without a commit; resample
    // so the next change starts from the new layout.
    const ro = new ResizeObserver(() => {
      if (!raf) tick();
    });
    ro.observe(root);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref, dep, anchor]);
}
