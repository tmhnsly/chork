"use client";

import { useState } from "react";
import { BrandDivider } from "./BrandDivider";
import { CollapseFade } from "@/components/motion";
import styles from "./setMeta.module.scss";

interface Props {
  /**
   * Date the set resets. Accepts anything already pre-formatted by
   * the caller (e.g. "20 April" or "Apr 20"); the "Resets " prefix
   * is added here. Pass `null` / omit to hide — the "Resets" half
   * and its brand divider collapse + slide out using the shared
   * `CollapseFade` primitive, same motion vocabulary as the
   * `RollingNumber` increment animation.
   */
  resetDate?: string | null;
  /** Gym name. Hidden when null / omitted. */
  gymName?: string | null;
}

/**
 * Shared meta row for set-scoped cards — renders
 * "Resets 20 April · Yonder" with a `BrandDivider` between the two
 * parts. When `resetDate` flips to null (e.g. switching to the
 * leaderboard's All-Time tab), the Resets cluster collapses + fades
 * out cleanly rather than snapping away; the gym name slides left
 * as the width closes.
 */
export function SetMeta({ resetDate, gymName }: Props) {
  // Hold the last non-null reset date so the exit animation can
  // keep rendering "Resets 20 April" while the width collapses.
  // Without this, the text would flash to "Resets " mid-transition.
  //
  // Implemented as derived state + setState-during-render (React's
  // sanctioned pattern for "remember a previous prop"), not a ref —
  // `react-hooks/refs` forbids touching `ref.current` in the render
  // body on React 19.
  const [lastDate, setLastDate] = useState<string | null>(resetDate ?? null);
  if (resetDate && resetDate !== lastDate) {
    setLastDate(resetDate);
  }
  const displayDate = resetDate ?? lastDate;

  if (!displayDate && !gymName) return null;

  return (
    <span className={styles.row}>
      <CollapseFade show={!!resetDate}>
        <span>Resets {displayDate}</span>
        {gymName && <BrandDivider />}
      </CollapseFade>
      {gymName && <span className={styles.gym}>{gymName}</span>}
    </span>
  );
}
