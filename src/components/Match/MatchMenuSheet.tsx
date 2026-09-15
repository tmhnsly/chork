"use client";

import { useState } from "react";
import { FaFlag, FaRightFromBracket, FaTrashCan } from "react-icons/fa6";
import {
  BottomSheet,
  Button,
  ConfirmInline,
  SheetBody,
} from "@/components/ui";
import styles from "./matchMenuSheet.module.scss";

interface Props {
  /** The host ends; everyone else leaves. */
  isHost: boolean;
  /**
   * Offer Delete game: `canDeleteGame`, the rule `delete_match`
   * enforces. Only ever true for the host.
   */
  canDelete: boolean;
  /** The delete confirmation, naming who else loses the game. */
  deleteWarning: string;
  onClose: () => void;
  onEnd: () => void;
  /**
   * Park the caller's seat. Everyone except the host — the host ends
   * the Match instead, and `leaveMatchAction` deliberately has no
   * hand-over path for them (see the refusal in crew-lifecycle for
   * the same shape).
   */
  onLeave: () => void;
  /** Delete the game for everyone. */
  onDelete: () => void;
  pending: boolean;
}

export function MatchMenuSheet({
  isHost,
  canDelete,
  deleteWarning,
  onClose,
  onEnd,
  onLeave,
  onDelete,
  pending,
}: Props) {
  const [confirming, setConfirming] = useState<"end" | "leave" | "delete" | null>(null);
  return (
    <BottomSheet open onClose={onClose} title="Game menu">
      <SheetBody>
        {/* Ending is the host's — it reaches everyone else's screen.
            Everyone else leaves, which reaches only their own. The
            server enforces both; this just stops offering an action
            that would come back as an error. */}
        {confirming === null && (
          <div className={styles.actions}>
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirming(isHost ? "end" : "leave")}
              fullWidth
            >
              {isHost ? (
                <>
                  <FaFlag aria-hidden /> End game
                </>
              ) : (
                <>
                  <FaRightFromBracket aria-hidden /> Leave game
                </>
              )}
            </Button>
            {/* Deleting reaches further than ending: the game goes for
                everyone, routes and sends included. Quieter than End
                game, and confirmed with the names of who loses it. */}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirming("delete")}
                fullWidth
              >
                <FaTrashCan aria-hidden /> Delete game
              </Button>
            )}
          </div>
        )}

        {confirming === "end" && (
          <ConfirmInline
            prompt={
              <p>
                End the game for everyone? Final scores will be calculated
                and the game will be closed. This cannot be undone.
              </p>
            }
            confirmLabel="Yes, end game"
            pendingLabel="Ending…"
            onConfirm={onEnd}
            onCancel={() => setConfirming(null)}
            pending={pending}
          />
        )}

        {confirming === "leave" && (
          <ConfirmInline
            prompt={
              <p>
                Leave this game? You keep the points you&rsquo;ve already
                scored and stay on the board — you just can&rsquo;t log
                anything more.
              </p>
            }
            confirmLabel="Yes, leave"
            pendingLabel="Leaving…"
            onConfirm={onLeave}
            onCancel={() => setConfirming(null)}
            pending={pending}
          />
        )}

        {confirming === "delete" && (
          <ConfirmInline
            prompt={<p>{deleteWarning}</p>}
            confirmLabel="Yes, delete game"
            pendingLabel="Deleting…"
            onConfirm={onDelete}
            onCancel={() => setConfirming(null)}
            pending={pending}
          />
        )}
      </SheetBody>
    </BottomSheet>
  );
}
