"use client";

import { useMemo, useState } from "react";
import { FaBolt, FaFlag, FaMinus, FaPlus } from "react-icons/fa6";
import { BottomSheet, Button } from "@/components/ui";
import { formatGrade } from "@/lib/data/grade-label";
import type { JamRoute, JamLog, JamGradingScale } from "@/lib/data/jam-types";
import styles from "./jamLogSheet.module.scss";

interface Props {
  route: JamRoute;
  log: JamLog | null;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: JamGradingScale;
  onClose: () => void;
  onEdit: () => void;
  onSubmit: (payload: {
    attempts: number;
    completed: boolean;
    zone: boolean;
  }) => void;
  pending: boolean;
}

/**
 * Attempt logger for a jam route. Stripped-down variant of
 * `RouteLogSheet` — no beta spray / comments, no community grade
 * averaging, no setter name. Jams are ephemeral; the only thing
 * the sheet cares about is attempts + completed + zone.
 */
export function JamLogSheet({
  route,
  log,
  grades,
  gradingScale,
  onClose,
  onEdit,
  onSubmit,
  pending,
}: Props) {
  const [attempts, setAttempts] = useState(log?.attempts ?? 0);
  const [completed, setCompleted] = useState(log?.completed ?? false);
  const [zone, setZone] = useState(log?.zone ?? false);

  const gradeLabel = useMemo(() => {
    if (route.grade === null || route.grade === undefined) return null;
    if (gradingScale === "custom") {
      return grades.find((g) => g.ordinal === route.grade)?.label ?? null;
    }
    return formatGrade(route.grade, gradingScale);
  }, [route.grade, gradingScale, grades]);

  const points = useMemo(() => {
    if (!completed) return zone ? 1 : 0;
    const base =
      attempts === 1 ? 4 : attempts === 2 ? 3 : attempts === 3 ? 2 : 1;
    return base + (zone ? 1 : 0);
  }, [attempts, completed, zone]);

  function bumpAttempts(delta: number) {
    setAttempts((prev) => {
      const next = Math.max(0, Math.min(999, prev + delta));
      if (next === 0) setCompleted(false);
      return next;
    });
  }

  function handleComplete() {
    const next = !completed;
    setCompleted(next);
    if (next && attempts === 0) setAttempts(1);
    // Fire immediately so the send lands on the leaderboard fast.
    onSubmit({
      attempts: next && attempts === 0 ? 1 : attempts,
      completed: next,
      zone,
    });
  }

  function commitAttempts() {
    onSubmit({ attempts, completed, zone });
  }

  function toggleZone() {
    const next = !zone;
    setZone(next);
    onSubmit({ attempts, completed, zone: next });
  }

  return (
    <BottomSheet open onClose={onClose} title={`Route ${route.number}`}>
      <div className={styles.body}>
        <header className={styles.header}>
          <span className={styles.number}>#{route.number}</span>
          {gradeLabel && <span className={styles.gradeBadge}>{gradeLabel}</span>}
        </header>

        {route.description && (
          <p className={styles.description}>{route.description}</p>
        )}

        <div className={styles.counter}>
          <button
            type="button"
            className={styles.counterButton}
            onClick={() => bumpAttempts(-1)}
            disabled={attempts === 0}
            aria-label="Decrement attempts"
          >
            <FaMinus aria-hidden />
          </button>
          <div className={styles.counterValue}>
            <span className={styles.counterNumber}>{attempts}</span>
            <span className={styles.counterLabel}>
              {attempts === 1 ? "attempt" : "attempts"}
            </span>
          </div>
          <button
            type="button"
            className={styles.counterButton}
            onClick={() => bumpAttempts(1)}
            aria-label="Increment attempts"
          >
            <FaPlus aria-hidden />
          </button>
        </div>

        <div className={styles.pointsRow}>
          <span className={styles.pointsLabel}>
            {completed ? "Earning" : "Send now:"}
          </span>
          <span className={styles.pointsValue}>
            {completed && attempts === 1 && <FaBolt aria-hidden />}
            {points} pts
          </span>
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant={completed ? "secondary" : "primary"}
            onClick={handleComplete}
            disabled={pending}
            fullWidth
          >
            {completed ? "Undo send" : attempts === 0 ? "Flash it" : "Mark send"}
          </Button>
          {attempts > 0 && !completed && (
            <Button
              type="button"
              variant="secondary"
              onClick={commitAttempts}
              disabled={pending}
              fullWidth
            >
              Save attempts
            </Button>
          )}
          {route.has_zone && (
            <Button
              type="button"
              variant={zone ? "primary" : "secondary"}
              onClick={toggleZone}
              disabled={pending}
              fullWidth
            >
              <FaFlag aria-hidden />
              {zone ? "Zone claimed" : "Claim zone"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onEdit} fullWidth>
            Edit route
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
