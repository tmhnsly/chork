"use client";

import { useEffect, useState, type RefObject } from "react";
import { pinProgress, stepAt } from "@/lib/scroll-progress";

/**
 * Which of `steps` states a pinned section is in (see `pinProgress` and
 * `stepAt`).
 *
 * Cheap by construction: an IntersectionObserver turns the scroll
 * listener on only while the section is on screen, the listener reads
 * layout at most once per frame, and the value is quantised to a step
 * HERE — React bails out of a same-value update, so the device screen
 * re-renders once per step, not once per scroll frame. When the
 * section leaves, one last read settles it at its first or last step
 * so a section scrolled past quickly still ends in its end state.
 */
export function useScrollStep(ref: RefObject<HTMLElement | null>, steps: number): number {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let listening = false;

    const read = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      setStep(stepAt(pinProgress(rect.top, rect.height, window.innerHeight), steps));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
      } else {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      listen(entry.isIntersecting);
      schedule();
    });
    io.observe(el);

    return () => {
      io.disconnect();
      listen(false);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, steps]);

  return step;
}

/**
 * True once `threshold` of the element has been on screen. Latches:
 * an arrival plays once and stays played, so scrolling back up never
 * un-does it (and reduced motion callers can just ignore it).
 */
export function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.4): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, inView]);

  return inView;
}
