"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, showToast } from "@/components/ui";
import {
  createSet,
  updateSet,
  archiveSet,
  publishSet,
  unpublishSet,
} from "@/app/admin/actions";
import styles from "./setForm.module.scss";

type Scale = "v" | "font" | "points";
type Status = "draft" | "live" | "archived";

// Upper bound for the grade slider per scale. Source of truth for the
// climber-side community grade slider in a follow-up phase — the admin
// picks this, the climber UI reads it back.
const SCALE_MAX_DEFAULT: Record<Scale, number> = {
  v: 10,
  font: 20,
  points: 0,
};

interface Props {
  mode: "create" | "edit";
  gymId: string;
  set?: {
    id: string;
    name: string | null;
    startsAt: string;
    endsAt: string;
    gradingScale: Scale;
    maxGrade: number;
    status: Status;
    closingEvent: boolean;
  };
}

/**
 * Single form used by both the new-set and edit-set pages. Mode-driven
 * so the same validation, field list, and submit handling covers both
 * entry points — avoids duplicating form code that inevitably drifts.
 */
export function SetForm({ mode, gymId, set }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(set?.name ?? "");
  const [startsAt, setStartsAt] = useState(toDateInput(set?.startsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(set?.endsAt));
  const [scale, setScale] = useState<Scale>(set?.gradingScale ?? "v");
  const [maxGrade, setMaxGrade] = useState<number>(set?.maxGrade ?? SCALE_MAX_DEFAULT.v);
  const [closingEvent, setClosingEvent] = useState<boolean>(set?.closingEvent ?? false);

  function handleScaleChange(next: Scale) {
    setScale(next);
    // Reset max to the scale's natural default when switching so the
    // admin doesn't inherit a bogus cap from the previous choice.
    setMaxGrade(SCALE_MAX_DEFAULT[next]);
  }

  function handleSubmit(publishing: boolean) {
    return (e?: React.FormEvent) => {
      e?.preventDefault();
      startTransition(async () => {
        const payload = {
          gymId,
          name,
          startsAt: fromDateInput(startsAt),
          endsAt: fromDateInput(endsAt),
          gradingScale: scale,
          maxGrade,
          status: (publishing ? "live" : "draft") as "live" | "draft",
          closingEvent,
        };

        if (mode === "create") {
          const res = await createSet(payload);
          if ("error" in res) {
            showToast(res.error, "error");
            return;
          }
          showToast(publishing ? "Set published" : "Draft saved", "success");
          router.push("/admin/sets");
          router.refresh();
        } else if (set) {
          const res = await updateSet(set.id, payload);
          if ("error" in res) {
            showToast(res.error, "error");
            return;
          }
          showToast("Set updated", "success");
          router.refresh();
        }
      });
    };
  }

  async function handleStatusAction(
    action: typeof publishSet | typeof unpublishSet | typeof archiveSet,
    successMessage: string
  ) {
    if (!set) return;
    startTransition(async () => {
      const res = await action(set.id);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(successMessage, "success");
      router.refresh();
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(false)}>
      <label className={styles.field}>
        <span className={styles.label}>Name (optional)</span>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Spring Comp 2026"
          maxLength={80}
        />
        <span className={styles.hint}>
          Leave blank to display the date range as the label.
        </span>
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
          <span className={styles.label}>Ends</span>
          <input
            className={styles.input}
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        </label>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Grading scale</legend>
        <div className={styles.scaleRow}>
          {(["v", "font", "points"] as Scale[]).map((id) => (
            <label
              key={id}
              className={`${styles.scaleChip} ${scale === id ? styles.scaleChipActive : ""}`}
            >
              <input
                type="radio"
                name="scale"
                value={id}
                checked={scale === id}
                onChange={() => handleScaleChange(id)}
                className={styles.visuallyHidden}
              />
              {id === "v" ? "V-scale" : id === "font" ? "Font" : "Points only"}
            </label>
          ))}
        </div>
      </fieldset>

      {scale !== "points" && (
        <label className={styles.field}>
          <span className={styles.label}>
            Max {scale === "v" ? "V-grade" : "Font grade"}
          </span>
          <input
            className={styles.input}
            type="number"
            min={0}
            max={30}
            value={maxGrade}
            onChange={(e) => setMaxGrade(Number(e.target.value))}
          />
          <span className={styles.hint}>
            Caps the climber-side community-grade slider for this set.
          </span>
        </label>
      )}

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={closingEvent}
          onChange={(e) => setClosingEvent(e.target.checked)}
        />
        <span>Closing event (final round at a single venue)</span>
      </label>

      <div className={styles.actions}>
        {mode === "create" ? (
          <>
            <Button type="submit" disabled={pending} variant="secondary">
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={handleSubmit(true)}
            >
              {pending ? "Publishing…" : "Publish"}
            </Button>
          </>
        ) : set ? (
          <EditActions
            status={set.status}
            pending={pending}
            onSaveDraft={handleSubmit(false)}
            onPublish={() => handleStatusAction(publishSet, "Set published")}
            onUnpublish={() => handleStatusAction(unpublishSet, "Set moved to draft")}
            onArchive={() => handleStatusAction(archiveSet, "Set archived")}
          />
        ) : null}
      </div>
    </form>
  );
}

function EditActions(props: {
  status: Status;
  pending: boolean;
  onSaveDraft: (e?: React.FormEvent) => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
}) {
  return (
    <>
      <Button type="submit" disabled={props.pending} variant="secondary" onClick={props.onSaveDraft}>
        {props.pending ? "Saving…" : "Save changes"}
      </Button>

      {props.status === "draft" && (
        <Button type="button" disabled={props.pending} onClick={props.onPublish}>
          Publish
        </Button>
      )}
      {props.status === "live" && (
        <>
          <Button type="button" disabled={props.pending} variant="secondary" onClick={props.onUnpublish}>
            Move to draft
          </Button>
          <Button type="button" disabled={props.pending} variant="danger" onClick={props.onArchive}>
            Archive
          </Button>
        </>
      )}
      {props.status === "archived" && (
        <Button type="button" disabled={props.pending} onClick={props.onPublish}>
          Reactivate
        </Button>
      )}
    </>
  );
}

// ── Date-input helpers ────────────────────────────
// `<input type="date">` wants `YYYY-MM-DD`; DB stores timestamptz.
// Convert in both directions at the form boundary so the DB format
// doesn't leak into the UI.

function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00Z`).toISOString();
}
