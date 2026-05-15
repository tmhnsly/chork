"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FaArrowRight, FaBolt } from "react-icons/fa6";
import {
  AttemptCounter,
  BottomSheet,
  Button,
  CompletedRow,
  LogSheetHeader,
  SheetActions,
  SheetBody,
  ZoneHoldRow,
} from "@/components/ui";
import { BrandDivider } from "@/components/ui/BrandDivider";
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { formatGrade } from "@/lib/data/grade-label";
import type { JamRoute, JamLog, JamGradingScale } from "@/lib/data/jam-types";
import styles from "./jamLogSheet.module.scss";

/**
 * Matches the wall sheet's attempt-save cadence. One quick burst
 * of +/- taps should produce a single server write once the user
 * settles; shorter than this and rapid tapping writes twice.
 */
const ATTEMPTS_DEBOUNCE_MS = 800;

interface Props {
  route: JamRoute;
  log: JamLog | null;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: JamGradingScale;
  onClose: () => void;
  onEdit: () => void;
  /**
   * Fires with the full log payload. Debounced (800 ms) when the
   * attempts counter changes so a quick burst of +/- taps produces
   * a single server write; immediate on mark-send, undo, and zone
   * toggle. The parent is expected to dispatch an optimistic patch
   * on each call — `JamScreen` already does that via its offline-
   * queue wrapper.
   *
   * No pending/isSaving prop: mark-complete flips to `CompletedRow`
   * on the same tick via local state, so the user never sees the
   * Mark button in a "Saving…" limbo state. Errors roll back on
   * the parent via a return-path dispatch that echoes back through
   * the `log` prop.
   */
  onSubmit: (payload: {
    attempts: number;
    completed: boolean;
    zone: boolean;
  }) => void;
}

/**
 * Attempt logger for a jam route. Visually identical to the wall's
 * `RouteLogSheet` — same header, same [−] [N] [+] counter, same
 * ZoneHoldRow, same completed badge + Undo. Differences are
 * deliberate:
 *   • No beta-spray drawer — jams are ephemeral and a 20-player
 *     session has too little signal to spray over.
 *   • No community grade display — jam routes carry a fixed grade
 *     set at route-creation time, no voting.
 *   • An extra "Edit route" button in the footer so hosts can fix
 *     a mis-typed description or bump the grade mid-jam.
 */
export function JamLogSheet({
  route,
  log,
  grades,
  gradingScale,
  onClose,
  onEdit,
  onSubmit,
}: Props) {
  const [attempts, setAttempts] = useState(log?.attempts ?? 0);
  const [completed, setCompleted] = useState(log?.completed ?? false);
  const [zone, setZone] = useState(log?.zone ?? false);

  // Latest-state refs for the debounced attempts flush. Without them
  // the debounce closure would capture `completed` / `zone` at the
  // time +/- was tapped, and a user who toggled zone between the tap
  // and the 800ms fire would see their zone write silently
  // overwritten by the delayed attempts save. Commit-phase write
  // avoids `react-hooks/refs` flagging render-time ref writes.
  const completedRef = useRef(completed);
  const zoneRef = useRef(zone);
  useEffect(() => {
    completedRef.current = completed;
    zoneRef.current = zone;
  });

  // Debounced attempts save. Mirrors the wall sheet's pattern via
  // the shared `useDebouncedFlush` primitive — auto-flushes on
  // unmount so a quick open → tap + → close doesn't drop the
  // increment. The flush reads the LATEST completed/zone via refs.
  const attemptsFlush = useDebouncedFlush<number>({
    delayMs: ATTEMPTS_DEBOUNCE_MS,
    flush: (next) => {
      onSubmit({
        attempts: next,
        completed: completedRef.current,
        zone: zoneRef.current,
      });
    },
  });

  // Intentionally NO `log` → local state sync effect. The canonical
  // flow is:
  //   1. user interacts → local state changes optimistically
  //   2. onSubmit fires → parent dispatches optimistic log
  //   3. log prop echoes our own state back — already in sync
  // The edge case we accept: if the parent rolls back our
  // optimistic dispatch (server error, retry) the sheet keeps the
  // local pre-error state until the user closes + reopens. Project
  // lint (`react-hooks/set-state-in-effect`) forbids mirroring a
  // prop into state inside an effect and the rare drift isn't
  // worth the keyed-cache gymnastics.

  const gradeLabel = useMemo(() => {
    if (route.grade === null || route.grade === undefined) return null;
    if (gradingScale === "custom") {
      return grades.find((g) => g.ordinal === route.grade)?.label ?? null;
    }
    return formatGrade(route.grade, gradingScale);
  }, [route.grade, gradingScale, grades]);

  // What the climber would earn if they completed at this attempt
  // count right now (the "Send now → N pts" preview). The actual
  // earned points follow the same formula — when `completed` is
  // already true the preview and the stored value match.
  const sendPoints = useMemo(() => {
    if (attempts === 0) return 0;
    const base =
      attempts === 1 ? 4 : attempts === 2 ? 3 : attempts === 3 ? 2 : 1;
    return base + (zone ? 1 : 0);
  }, [attempts, zone]);

  const isCurrentFlash = completed && attempts === 1;

  const handleAttemptsChange = useCallback(
    (next: number) => {
      // Can't change attempts while the route is completed; the +/-
      // buttons are already disabled in that state, this is a belt-
      // and-braces guard for any programmatic callers.
      if (completedRef.current) return;
      setAttempts(next);
      attemptsFlush.schedule(next);
    },
    [attemptsFlush],
  );

  function handleComplete() {
    // Cancel any pending attempts debounce — this write already
    // carries the latest `attempts` value, and leaving the timer
    // running would fire an 800ms-later write with completed=false
    // and clobber the completion we just made.
    attemptsFlush.cancel();
    const finalAttempts = attempts === 0 ? 1 : attempts;
    setAttempts(finalAttempts);
    setCompleted(true);
    onSubmit({ attempts: finalAttempts, completed: true, zone });
  }

  function handleUndo() {
    attemptsFlush.cancel();
    setCompleted(false);
    onSubmit({ attempts, completed: false, zone });
  }

  function handleZoneToggle(checked: boolean) {
    // Same reason as handleComplete: a pending attempts debounce
    // would fire later with the OLD zone (captured in the flush
    // callback's ref read at fire time) and clobber the toggle.
    attemptsFlush.cancel();
    setZone(checked);
    onSubmit({ attempts, completed, zone: checked });
  }

  const pointsPreview: ReactNode = completed ? (
    <>
      <span className={styles.ptsValue}>{sendPoints}</span> pts
    </>
  ) : attempts === 0 ? (
    "\u00A0"
  ) : (
    <>
      Send now <FaArrowRight className={styles.ptsArrow} />{" "}
      <span
        className={`${styles.ptsValue} ${attempts === 1 ? styles.ptsValueFlash : ""}`}
      >
        {sendPoints} pts
      </span>
      {attempts === 1 && <FaBolt className={styles.ptsFlash} />}
      {zone && <span className={styles.ptsZone}>+1 zone</span>}
    </>
  );

  return (
    <BottomSheet open onClose={onClose} title={`Route ${route.number}`}>
      <SheetBody>
        <LogSheetHeader
          number={route.number}
          showFlash={isCurrentFlash}
          showZone={completed && zone}
          subline={
            gradeLabel ? (
              <span className={styles.gradeLine}>
                <span className={styles.gradeValue}>{gradeLabel}</span>
                {route.description && (
                  <>
                    <BrandDivider />
                    <span className={styles.gradeMeta}>{route.description}</span>
                  </>
                )}
              </span>
            ) : route.description ? (
              <span className={styles.gradeLine}>
                <span className={styles.gradeMeta}>{route.description}</span>
              </span>
            ) : null
          }
        />

        <AttemptCounter
          attempts={attempts}
          hideControls={completed}
          disabled={completed}
          onChange={handleAttemptsChange}
          pointsEarned={completed}
          pointsPreview={pointsPreview}
        />

        <div className={styles.controls}>
          {route.has_zone && !completed && (
            <ZoneHoldRow
              checked={zone}
              onCheckedChange={handleZoneToggle}
              hasAttempts={attempts > 0}
            />
          )}

          {completed ? (
            <CompletedRow
              isFlash={isCurrentFlash}
              hasZone={zone}
              onUndo={handleUndo}
            />
          ) : (
            <Button
              onClick={handleComplete}
              disabled={attempts < 1}
              fullWidth
            >
              Mark as complete
            </Button>
          )}
        </div>

        <SheetActions>
          <Button type="button" variant="ghost" onClick={onEdit} fullWidth>
            Edit route
          </Button>
        </SheetActions>
      </SheetBody>
    </BottomSheet>
  );
}
