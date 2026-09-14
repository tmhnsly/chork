"use client";

import { useState } from "react";
import { FaFlag, FaRightFromBracket } from "react-icons/fa6";
import {
  BottomSheet,
  Button,
  ConfirmInline,
  SheetBody,
} from "@/components/ui";

interface Props {
  /** The host ends; everyone else leaves. */
  isHost: boolean;
  onClose: () => void;
  onEnd: () => void;
  /**
   * Park the caller's seat. Everyone except the host — the host ends
   * the Match instead, and `leaveMatchAction` deliberately has no
   * hand-over path for them (see the refusal in crew-lifecycle for
   * the same shape).
   */
  onLeave: () => void;
  pending: boolean;
}

export function MatchMenuSheet({
  isHost,
  onClose,
  onEnd,
  onLeave,
  pending,
}: Props) {
  const [confirming, setConfirming] = useState<"end" | "leave" | null>(null);
  return (
    <BottomSheet open onClose={onClose} title="Game menu">
      <SheetBody>
        {/* Ending is the host's — it reaches everyone else's screen.
            Everyone else leaves, which reaches only their own. The
            server enforces both; this just stops offering an action
            that would come back as an error. */}
        {confirming === null && (
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
      </SheetBody>
    </BottomSheet>
  );
}
