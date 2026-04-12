"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, showToast } from "@/components/ui";
import {
  createNewCompetition,
  updateCompetitionAction,
} from "@/app/admin/actions";
import styles from "./competitionForm.module.scss";

type Status = "draft" | "live" | "archived";

interface Props {
  mode: "create" | "edit";
  competition?: {
    id: string;
    name: string;
    description: string;
    startsAt: string;
    endsAt: string | null;
    status: Status;
  };
}

export function CompetitionForm({ mode, competition }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(competition?.name ?? "");
  const [description, setDescription] = useState(competition?.description ?? "");
  const [startsAt, setStartsAt] = useState(toDateInput(competition?.startsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(competition?.endsAt ?? undefined));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      if (mode === "create") {
        const res = await createNewCompetition({
          name,
          description,
          startsAt: fromDateInput(startsAt),
          endsAt: endsAt ? fromDateInput(endsAt) : null,
        });
        if ("error" in res) {
          showToast(res.error, "error");
          return;
        }
        showToast("Competition created", "success");
        router.push(`/admin/competitions/${res.competitionId}`);
      } else if (competition) {
        const res = await updateCompetitionAction(competition.id, {
          name,
          description: description.trim() || null,
          startsAt: fromDateInput(startsAt),
          endsAt: endsAt ? fromDateInput(endsAt) : null,
        });
        if ("error" in res) {
          showToast(res.error, "error");
          return;
        }
        showToast("Competition updated", "success");
        router.refresh();
      }
    });
  }

  async function handleStatus(status: Status) {
    if (!competition) return;
    startTransition(async () => {
      const res = await updateCompetitionAction(competition.id, { status });
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`Competition ${status}`, "success");
      router.refresh();
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          placeholder="Spring Throwdown 2026"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Description (optional)</span>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief public description shown on the leaderboard."
          rows={3}
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Starts</span>
          <input
            className={styles.input}
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Ends (optional)</span>
          <input
            className={styles.input}
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.actions}>
        <Button type="submit" disabled={pending} variant="secondary">
          {pending ? "Saving…" : mode === "create" ? "Create competition" : "Save changes"}
        </Button>

        {mode === "edit" && competition && (
          <>
            {competition.status === "draft" && (
              <Button type="button" disabled={pending} onClick={() => handleStatus("live")}>
                Publish
              </Button>
            )}
            {competition.status === "live" && (
              <>
                <Button type="button" disabled={pending} variant="secondary" onClick={() => handleStatus("draft")}>
                  Move to draft
                </Button>
                <Button type="button" disabled={pending} variant="danger" onClick={() => handleStatus("archived")}>
                  Archive
                </Button>
              </>
            )}
            {competition.status === "archived" && (
              <Button type="button" disabled={pending} onClick={() => handleStatus("live")}>
                Reactivate
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}

function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00Z`).toISOString();
}
