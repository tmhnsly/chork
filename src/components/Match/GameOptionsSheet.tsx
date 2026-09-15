"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaEllipsisVertical, FaEye, FaEyeSlash, FaTrashCan } from "react-icons/fa6";
import {
  BottomSheet,
  Button,
  ConfirmInline,
  IconButton,
  SheetBody,
  showToast,
} from "@/components/ui";
import { deleteMatchAction, setMatchHiddenAction } from "@/app/match/actions";
import styles from "./gameOptionsSheet.module.scss";

interface Props {
  matchId: string;
  /** The viewer has taken this game off their own games. */
  hidden: boolean;
  /** Offer Delete game (`canDeleteGame`). */
  canDelete: boolean;
  /** The host's league week, which has to leave its league before it can go. */
  leagueWeek: { id: string; name: string } | null;
  /** The delete confirmation, naming who else loses the game. */
  deleteWarning: string;
}

/**
 * A finished game's ⋮ menu (migration 141). Everyone can take the game
 * off their own games and put it back; the host can delete it for
 * everyone, unless it's a league week, which leaves its league first.
 */
export function GameOptionsSheet({ matchId, hidden, canDelete, leagueWeek, deleteWarning }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<"remove" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setConfirming(null);
  }

  function setHidden(next: boolean) {
    startTransition(async () => {
      const result = await setMatchHiddenAction(matchId, next);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      showToast(next ? "Removed from your games" : "Back in your games");
      close();
      router.refresh();
    });
  }

  function deleteGame() {
    startTransition(async () => {
      const result = await deleteMatchAction(matchId);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      showToast("Game deleted");
      router.replace("/match");
    });
  }

  return (
    <>
      <IconButton label="Game options" onClick={() => setOpen(true)}>
        <FaEllipsisVertical />
      </IconButton>
      {open && (
        <BottomSheet open onClose={close} title="Game options">
          <SheetBody>
            {confirming === null && (
              <div className={styles.actions}>
                {hidden ? (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    loading={pending}
                    onClick={() => setHidden(false)}
                  >
                    <FaEye aria-hidden /> Put back in my games
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    onClick={() => setConfirming("remove")}
                  >
                    <FaEyeSlash aria-hidden /> Remove from my games
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="danger"
                    fullWidth
                    onClick={() => setConfirming("delete")}
                  >
                    <FaTrashCan aria-hidden /> Delete game
                  </Button>
                )}
                {leagueWeek && (
                  <p className={styles.note}>
                    This is a week of{" "}
                    <Link href={`/match/league/${leagueWeek.id}`}>{leagueWeek.name}</Link>.
                    Remove it from the league first.
                  </p>
                )}
              </div>
            )}

            {confirming === "remove" && (
              <ConfirmInline
                prompt={
                  <p>
                    Remove this game from your games? It stays for everyone
                    else, and you can put it back from this page.
                  </p>
                }
                confirmLabel="Yes, remove it"
                pendingLabel="Removing…"
                onConfirm={() => setHidden(true)}
                onCancel={() => setConfirming(null)}
                pending={pending}
              />
            )}

            {confirming === "delete" && (
              <ConfirmInline
                prompt={<p>{deleteWarning}</p>}
                confirmLabel="Yes, delete game"
                pendingLabel="Deleting…"
                onConfirm={deleteGame}
                onCancel={() => setConfirming(null)}
                pending={pending}
              />
            )}
          </SheetBody>
        </BottomSheet>
      )}
    </>
  );
}
