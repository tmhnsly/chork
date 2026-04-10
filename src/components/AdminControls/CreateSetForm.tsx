"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, showToast } from "@/components/ui";
import { createSet } from "@/app/(app)/admin-actions";
import styles from "./adminControls.module.scss";

interface Props {
  gymId: string;
}

export function CreateSetForm({ gymId }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // Default: starts today, ends in 4 weeks
  const today = new Date().toISOString().split("T")[0];
  const fourWeeks = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState(fourWeeks);
  const [routeCount, setRouteCount] = useState(14);
  const [zoneRoutes, setZoneRoutes] = useState<Set<number>>(new Set());

  function toggleZone(routeNum: number) {
    setZoneRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(routeNum)) next.delete(routeNum);
      else next.add(routeNum);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const result = await createSet(
        gymId,
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString(),
        routeCount,
        [...zoneRoutes]
      );

      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }

      showToast("Set created with " + routeCount + " routes");
      router.refresh();
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.createSet}>
      <h2 className={styles.heading}>Create a new set</h2>
      <p className={styles.description}>
        Set up a new competition period with routes for your climbers.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.dateRow}>
          <label className={styles.field}>
            <span className={styles.label}>Starts</span>
            <input
              type="date"
              className={styles.input}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Ends</span>
            <input
              type="date"
              className={styles.input}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Number of routes</span>
          <input
            type="number"
            className={styles.input}
            value={routeCount}
            onChange={(e) => {
              const n = parseInt(e.target.value) || 0;
              setRouteCount(Math.min(50, Math.max(1, n)));
              // Remove zone selections for routes that no longer exist
              setZoneRoutes((prev) => {
                const next = new Set<number>();
                prev.forEach((r) => { if (r <= n) next.add(r); });
                return next;
              });
            }}
            min={1}
            max={50}
            required
          />
        </label>

        {routeCount > 0 && (
          <div className={styles.field}>
            <span className={styles.label}>Zone holds</span>
            <p className={styles.hint}>
              Tap routes that have a zone hold. Climbers get +1 point for reaching the zone.
            </p>
            <div className={styles.zoneGrid}>
              {Array.from({ length: routeCount }, (_, i) => {
                const num = i + 1;
                const active = zoneRoutes.has(num);
                return (
                  <button
                    key={num}
                    type="button"
                    className={`${styles.zoneTile} ${active ? styles.zoneTileActive : ""}`}
                    onClick={() => toggleZone(num)}
                    aria-label={`Route ${num} zone hold ${active ? "on" : "off"}`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Button type="submit" disabled={submitting} fullWidth>
          {submitting ? "Creating..." : "Create set"}
        </Button>
      </form>
    </div>
  );
}
