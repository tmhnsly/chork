"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FaBolt, FaCheck } from "react-icons/fa6";
import type { Route, RouteLog } from "@/lib/data";
import { completeRoute } from "@/app/(app)/actions";
import { Button, showToast } from "@/components/ui";
import styles from "./completeModal.module.scss";

const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"];
const GRADE_MIN = 0;
const GRADE_MAX = GRADES.length - 1;

interface Props {
  route: Route;
  attempts: number;
  onConfirm: (log: RouteLog) => void;
  onCancel: () => void;
}

export function CompleteModal({ route, attempts, onConfirm, onCancel }: Props) {
  const [gradeEnabled, setGradeEnabled] = useState(false);
  const [gradeIndex, setGradeIndex] = useState(Math.floor(GRADE_MAX / 2));
  const [zone, setZone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isFlash = attempts === 1;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const result = await completeRoute(
        route.id,
        attempts,
        gradeEnabled ? gradeIndex : null,
        zone
      );
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      if (result.log) {
        showToast(isFlash ? "Flash!" : "Route completed");
        onConfirm(result.log);
      }
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setSubmitting(false);
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

          {isFlash && (
            <div className={styles.flashCallout}>
              <FaBolt className={styles.flashIcon} />
              <span>Flash!</span>
            </div>
          )}

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

            {gradeEnabled && (
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
            )}

            {gradeEnabled && (
              <span className={styles.gradeValue}>{GRADES[gradeIndex]}</span>
            )}
          </div>

          {route.has_zone && (
            <button
              type="button"
              className={`${styles.gradeToggle} ${zone ? styles.gradeToggleOn : ""}`}
              onClick={() => setZone((v) => !v)}
            >
              <span className={styles.checkbox}>
                {zone && <FaCheck />}
              </span>
              <span className={styles.label}>Zone (+1 pt)</span>
            </button>
          )}

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
