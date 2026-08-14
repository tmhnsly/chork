"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode } from "react";
import { FaArrowRight, FaBolt } from "react-icons/fa6";
import {
  AttemptCounter,
  BottomSheet,
  Button,
  Collapse,
  CompletedRow,
  LogSheetHeader,
  SheetActions,
  SheetBody,
  ZoneHoldRow,
} from "@/components/ui";
import { BrandDivider } from "@/components/ui/BrandDivider";
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { makeGradeLabeller } from "@/lib/data/grade-label";
import { computePoints } from "@/lib/data/logs";
import type { JamRoute, JamLog, JamGradingScale } from "@/lib/data/jam-types";
import {
  initJamLogDraft,
  jamLogReducer,
  type JamLogDraftAction,
} from "./jamLogReducer";
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
  // The {attempts, completed, zone} triple is one draft value — every
  // submit ships all three — so it lives behind jamLogReducer instead
  // of three useStates with mirror refs. Transitions (the 0→1 coerce
  // on complete, attempts frozen while completed) are pure and
  // unit-tested in jamLogReducer.test.ts.
  const [draft, dispatch] = useReducer(jamLogReducer, log, initJamLogDraft);
  const { attempts, completed, zone } = draft;

  // Latest-draft ref for the debounced attempts flush. Without it the
  // debounce closure would capture completed/zone at the time +/- was
  // tapped, and a zone toggled between the tap and the 800ms fire
  // would be silently overwritten by the delayed attempts save.
  // Commit-phase write avoids `react-hooks/refs` flagging render-time
  // ref writes.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  /** Apply an action AND return the post-transition draft, so submit
   *  payloads come from the same pure transition the state takes. */
  const apply = useCallback(
    (action: JamLogDraftAction) => {
      dispatch(action);
      return jamLogReducer(draftRef.current, action);
    },
    [],
  );

  // Debounced attempts save. Mirrors the wall sheet's pattern via
  // the shared `useDebouncedFlush` primitive — auto-flushes on
  // unmount so a quick open → tap + → close doesn't drop the
  // increment. The flush reads the LATEST completed/zone via the
  // draft ref.
  const attemptsFlush = useDebouncedFlush<number>({
    delayMs: ATTEMPTS_DEBOUNCE_MS,
    flush: (next) => {
      onSubmit({ ...draftRef.current, attempts: next });
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

  const gradeLabel = useMemo(
    () => makeGradeLabeller(gradingScale, grades)(route.declared_grade),
    [route.declared_grade, gradingScale, grades],
  );

  // What the climber would earn if they completed at this attempt
  // count right now (the "Send now → N pts" preview). The actual
  // earned points follow the same formula — when `completed` is
  // already true the preview and the stored value match.
  // Points via the single-source ladder (`computePoints`) — never the
  // inlined formula. Mirrors the wall sheet's PointsPreview convention:
  // the completed figure INCLUDES the zone bonus, while the mid-attempt
  // preview EXCLUDES it and surfaces a separate "+1 zone" chip, so a
  // zone route never double-counts (the number PLUS the chip).
  const earnedPoints = useMemo(
    () => computePoints({ attempts, completed: true, zone }),
    [attempts, zone],
  );
  const previewPoints = useMemo(
    () => computePoints({ attempts, completed: true, zone: false }),
    [attempts],
  );

  const isCurrentFlash = completed && attempts === 1;

  const handleAttemptsChange = useCallback(
    (next: number) => {
      // The reducer freezes attempts while completed — if the action
      // was a no-op (same draft back), skip scheduling a write.
      const after = apply({ type: "set-attempts", attempts: next });
      if (after === draftRef.current) return;
      attemptsFlush.schedule(next);
    },
    [apply, attemptsFlush],
  );

  function handleComplete() {
    // Cancel any pending attempts debounce — this write already
    // carries the latest `attempts` value, and leaving the timer
    // running would fire an 800ms-later write with completed=false
    // and clobber the completion we just made. Same for undo + zone
    // below.
    attemptsFlush.cancel();
    onSubmit(apply({ type: "mark-complete" }));
  }

  function handleUndo() {
    attemptsFlush.cancel();
    onSubmit(apply({ type: "undo-complete" }));
  }

  function handleZoneToggle(checked: boolean) {
    attemptsFlush.cancel();
    onSubmit(apply({ type: "set-zone", zone: checked }));
  }

  const pointsPreview: ReactNode = completed ? (
    <>
      <span className={styles.ptsValue}>{earnedPoints}</span> pts
    </>
  ) : attempts === 0 ? (
    "\u00A0"
  ) : (
    <>
      Send now <FaArrowRight className={styles.ptsArrow} />{" "}
      <span
        className={`${styles.ptsValue} ${attempts === 1 ? styles.ptsValueFlash : ""}`}
      >
        {previewPoints} pts
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
          {/* Kept mounted inside an animated collapse (inert while
              closed) so completing animates the swap instead of
              unmounting the row in place — same fix as the gym
              RouteLogSheet. */}
          {route.has_zone && (
            <Collapse open={!completed} padBottom>
              <ZoneHoldRow
                checked={zone}
                onCheckedChange={handleZoneToggle}
                hasAttempts={attempts > 0}
              />
            </Collapse>
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
