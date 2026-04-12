"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaCheck } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { joinCompetition, leaveCompetition } from "@/app/(app)/actions";
import type { CompetitionCategory } from "@/lib/data/competition-queries";
import styles from "./competitionJoinBar.module.scss";

interface Props {
  competitionId: string;
  categories: CompetitionCategory[];
  participation: { category_id: string | null } | null;
}

/**
 * Compact bar that sits between the competition header and the
 * leaderboard. Shows either a join CTA (with optional category picker)
 * or a confirmation row with a leave option, depending on whether the
 * caller is already a participant.
 */
export function CompetitionJoinBar({
  competitionId,
  categories,
  participation,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>(
    participation?.category_id ?? ""
  );

  const joined = participation !== null;

  function handleJoin() {
    startTransition(async () => {
      const res = await joinCompetition(competitionId, category || null);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Joined competition", "success");
      router.refresh();
    });
  }

  function handleUpdateCategory() {
    if ((participation?.category_id ?? "") === category) return;
    startTransition(async () => {
      const res = await joinCompetition(competitionId, category || null);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Category updated", "success");
      router.refresh();
    });
  }

  function handleLeave() {
    startTransition(async () => {
      const res = await leaveCompetition(competitionId);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      setCategory("");
      showToast("Left competition", "info");
      router.refresh();
    });
  }

  return (
    <section className={styles.bar} aria-label="Competition participation">
      {categories.length > 0 && (
        <label className={styles.field}>
          <span className={styles.label}>Category</span>
          <select
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={pending}
          >
            <option value="">Open</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={styles.actions}>
        {!joined ? (
          <Button type="button" onClick={handleJoin} disabled={pending}>
            {pending ? "Joining…" : "Join competition"}
          </Button>
        ) : (
          <>
            <span className={styles.joinedPill}>
              <FaCheck aria-hidden /> You&apos;re in
            </span>
            {categories.length > 0 &&
              (participation?.category_id ?? "") !== category && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleUpdateCategory}
                  disabled={pending}
                >
                  Update category
                </Button>
              )}
            <Button
              type="button"
              variant="secondary"
              onClick={handleLeave}
              disabled={pending}
            >
              Leave
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
