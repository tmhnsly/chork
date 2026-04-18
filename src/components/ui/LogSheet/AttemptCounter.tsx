"use client";

import type { ReactNode } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { RollingNumber } from "@/components/RollingNumber/RollingNumber";
import styles from "./attemptCounter.module.scss";

interface Props {
  /** Current attempt count. Controlled by the consumer. */
  attempts: number;
  /** Label above the controls — "Attempts" by default. */
  label?: string;
  /**
   * When true, fades out the +/- buttons while preserving their
   * layout slot. Mirrors the wall sheet's post-send state so the
   * counter doesn't collapse into a smaller column when a route
   * gets completed.
   */
  hideControls?: boolean;
  /** Disables both buttons (e.g. set is archived, jam ended). */
  disabled?: boolean;
  /**
   * Fires with the new attempt count when the user taps +/-. The
   * consumer owns any debounce / optimistic / server-write logic
   * — this primitive is purely the UI + a haptic tap.
   */
  onChange: (next: number) => void;
  /**
   * Optional content rendered below the controls — "Send now → 4 pts",
   * "Flashed! 4 pts + 1 zone", etc. Slot is reserved regardless of
   * content so the counter's vertical rhythm is stable.
   */
  pointsPreview?: ReactNode;
  /** Adds the "earned" emphasis to the points row when the route is sent. */
  pointsEarned?: boolean;
}

/**
 * The shared [−] [N] [+] + points-preview block. Pulled out of the
 * wall's `RouteLogSheet` so the jam log sheet renders the identical
 * hero counter. All state stays in the consumer — debouncing the
 * resulting onChange + swapping its own points preview for the
 * just-earned one is up to the parent.
 */
export function AttemptCounter({
  attempts,
  label = "Attempts",
  hideControls = false,
  disabled = false,
  onChange,
  pointsPreview,
  pointsEarned = false,
}: Props) {
  function bump(delta: number) {
    if (disabled) return;
    const next = Math.max(0, attempts + delta);
    if (next === attempts) return;
    // Tiny vibration is a native-feeling nice-to-have; no-op on
    // platforms that don't expose the API.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
    onChange(next);
  }

  return (
    <div className={styles.counter}>
      <span className={styles.counterLabel}>{label}</span>
      <div className={styles.counterControls}>
        <button
          type="button"
          className={`${styles.counterBtn} ${hideControls ? styles.counterBtnHidden : ""}`}
          onClick={() => bump(-1)}
          disabled={disabled || attempts <= 0}
          aria-label={`Decrease ${label.toLowerCase()}`}
          aria-hidden={hideControls}
          tabIndex={hideControls ? -1 : 0}
        >
          <FaMinus />
        </button>
        <span className={styles.counterValue}>
          <RollingNumber value={attempts} />
        </span>
        <button
          type="button"
          className={`${styles.counterBtn} ${hideControls ? styles.counterBtnHidden : ""}`}
          onClick={() => bump(1)}
          disabled={disabled}
          aria-label={`Increase ${label.toLowerCase()}`}
          aria-hidden={hideControls}
          tabIndex={hideControls ? -1 : 0}
        >
          <FaPlus />
        </button>
      </div>
      <span
        className={`${styles.pointsPreview} ${pointsEarned ? styles.pointsEarned : ""}`}
      >
        {pointsPreview ?? "\u00A0"}
      </span>
    </div>
  );
}
