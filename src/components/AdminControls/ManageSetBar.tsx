"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { FaGear } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { endSet } from "@/app/(app)/admin-actions";
import type { RouteSet } from "@/lib/data";
import styles from "./adminControls.module.scss";

interface Props {
  set: RouteSet;
  gymId: string;
  routeCount: number;
}

export function ManageSetBar({ set, gymId, routeCount }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dateRange = [
    format(parseISO(set.starts_at), "MMM d"),
    format(parseISO(set.ends_at), "MMM d"),
  ].join(" – ");

  async function handleEndSet() {
    setSubmitting(true);
    try {
      const result = await endSet(gymId, set.id);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      showToast("Set archived");
      router.refresh();
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.manageBar}>
      <div className={styles.manageInfo}>
        <FaGear className={styles.manageIcon} />
        <div>
          <span className={styles.manageLabel}>Active set</span>
          <span className={styles.manageMeta}>
            {dateRange} · {routeCount} routes
          </span>
        </div>
      </div>

      {confirming ? (
        <div className={styles.manageActions}>
          <Button variant="danger" onClick={handleEndSet} disabled={submitting}>
            {submitting ? "Ending..." : "End set"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.manageBtn}
          onClick={() => setConfirming(true)}
        >
          End set
        </button>
      )}
    </div>
  );
}
