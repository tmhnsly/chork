"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FaBolt, FaCheck } from "react-icons/fa6";
import type { Route, RouteLog } from "@/lib/data";
import { createOptimisticLog } from "@/lib/data";
import { completeRoute } from "@/app/(app)/actions";
import { useAuth } from "@/lib/auth-context";
import { Button, showToast } from "@/components/ui";
import styles from "./completeModal.module.scss";

const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"];
const GRADE_MIN = 0;
const GRADE_MAX = GRADES.length - 1;

interface Props {
  route: Route;
  attempts: number;
  zone: boolean;
  logId?: string;
  onConfirm: (log: RouteLog) => void;
  onRevert: (log: RouteLog | null) => void;
  onCancel: () => void;
}

export function CompleteModal({ route, attempts, zone, logId, onConfirm, onRevert, onCancel }: Props) {
  const { user } = useAuth();
  const [gradeEnabled, setGradeEnabled] = useState(false);
  const [gradeIndex, setGradeIndex] = useState(Math.floor(GRADE_MAX / 2));
  const [submitting, setSubmitting] = useState(false);
  const isFlash = attempts === 1;

  async function handleConfirm() {
    setSubmitting(true);

    // Build an optimistic log and close immediately
    const gradeVote = gradeEnabled ? gradeIndex : null;
    const optimisticLog = createOptimisticLog({
      id: logId ?? "",
      user_id: user?.id ?? "",
      route_id: route.id,
      attempts,
      completed: true,
      grade_vote: gradeVote ?? undefined,
      zone,
    });

    showToast(isFlash ? "Flash!" : "Route completed");
    onConfirm(optimisticLog);

    // Server action runs after modal is closed — revert on failure
    const result = await completeRoute(route.id, attempts, gradeVote, zone, logId);
    if ("error" in result) {
      showToast(result.error, "error");
      onRevert(null);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>
            Complete Route {route.number}
          </Dialog.Title>

          <p className={styles.attempts}>
            {attempts} {attempts === 1 ? "attempt" : "attempts"}
          </p>

          <div
            className={styles.flashCallout}
            style={{ display: isFlash ? undefined : "none" }}
          >
            <FaBolt className={styles.flashIcon} />
            <span>Flash!</span>
          </div>

          <div className={styles.gradeSection}>
            <button
              type="button"
              className={`${styles.gradeToggle} ${gradeEnabled ? styles.gradeToggleOn : ""}`}
              onClick={() => setGradeEnabled((v) => !v)}
            >
              <span className={styles.checkbox}>
                {gradeEnabled && <FaCheck />}
              </span>
              <span className={styles.label}>Grade vote</span>
            </button>

            <div className={`${styles.gradeControls} ${gradeEnabled ? styles.gradeControlsVisible : ""}`}>
              <div className={styles.slider}>
                <span className={styles.sliderLabel}>{GRADES[GRADE_MIN]}</span>
                <input
                  type="range"
                  min={GRADE_MIN}
                  max={GRADE_MAX}
                  value={gradeIndex}
                  onChange={(e) => setGradeIndex(Number(e.target.value))}
                  className={styles.range}
                />
                <span className={styles.sliderLabel}>{GRADES[GRADE_MAX]}</span>
              </div>
              <span className={styles.gradeValue}>{GRADES[gradeIndex]}</span>
            </div>
          </div>

          <div className={styles.actions}>
            <Button onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Saving..." : "Confirm"}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
