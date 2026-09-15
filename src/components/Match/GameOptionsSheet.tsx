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
import { gameOptions } from "@/lib/data/match-deletion";
import styles from "./gameOptionsSheet.module.scss";

interface Props {
  matchId: string;
  /** The game has ended. Only a finished game can be taken off your games. */
  finished: boolean;
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
 * A game's ⋮ menu on its summary page (migration 141). Everyone can take
 * a finished game off their own games and put it back; the host can
 * delete it for everyone, unless it's a league week, which leaves its
 * league first. It offers only what the server allows (`gameOptions`),
 * and isn't there at all when that's nothing: a player on a live game.
 */
export function GameOptionsSheet({
  matchId,
  finished,
  hidden,
  canDelete,
  leagueWeek,
  deleteWarning,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<"remove" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();

  const options = gameOptions({ finished, hidden, canDelete, leagueWeek: leagueWeek !== null });
  if (options === null) return null;

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
                {options.hide === "put-back" && (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    loading={pending}
                    onClick={() => setHidden(false)}
                  >
                    <FaEye aria-hidden /> Put back in my games
                  </Button>
                )}
                {options.hide === "remove" && (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    onClick={() => setConfirming("remove")}
                  >
                    <FaEyeSlash aria-hidden /> Remove from my games
                  </Button>
                )}
                {options.delete && (
                  <Button
                    type="button"
                    variant="danger"
                    fullWidth
                    onClick={() => setConfirming("delete")}
                  >
                    <FaTrashCan aria-hidden /> Delete game
                  </Button>
                )}
                {options.leagueNote && leagueWeek && (
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
                // Reversible from this page, so not styled as destructive.
                confirmVariant="primary"
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
