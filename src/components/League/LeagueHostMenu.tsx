"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaEllipsis, FaFlagCheckered, FaPen } from "react-icons/fa6";
import { BottomSheet, Button, ConfirmInline, SheetBody, showToast } from "@/components/ui";
import type { LeagueRow } from "@/lib/data/league-types";
import { endLeagueAction, renameLeagueAction } from "@/app/match/league-actions";
import styles from "./leagueHostMenu.module.scss";

interface Props {
  league: LeagueRow;
}

const MAX_NAME = 80;

/** Rename or end. Removing a week lives on the week itself. */
export function LeagueHostMenu({ league }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(league.name);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const ended = league.ended_at !== null;
  const trimmed = name.trim();

  function rename() {
    startTransition(async () => {
      const result = await renameLeagueAction(league.id, trimmed);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function end() {
    startTransition(async () => {
      const result = await endLeagueAction(league.id);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="League options"
        onClick={() => setOpen(true)}
      >
        <FaEllipsis aria-hidden />
      </button>
      {open && (
        <BottomSheet open onClose={() => setOpen(false)} title="League">
          <SheetBody>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                type="text"
                className={styles.input}
                value={name}
                maxLength={MAX_NAME}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <Button
              type="button"
              onClick={rename}
              disabled={!trimmed || trimmed === league.name || pending}
              fullWidth
            >
              <FaPen aria-hidden /> Rename
            </Button>
            {!ended && !confirming && (
              <Button type="button" variant="ghost" fullWidth onClick={() => setConfirming(true)}>
                <FaFlagCheckered aria-hidden /> End the league
              </Button>
            )}
            {!ended && confirming && (
              <ConfirmInline
                prompt={<p>End the league? The table freezes and no more weeks can be started.</p>}
                confirmLabel="End the league"
                confirmVariant="danger"
                onConfirm={end}
                onCancel={() => setConfirming(false)}
                pending={pending}
              />
            )}
          </SheetBody>
        </BottomSheet>
      )}
    </>
  );
}
