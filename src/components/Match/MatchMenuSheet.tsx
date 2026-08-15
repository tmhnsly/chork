"use client";

import { useState } from "react";
import { FaCopy, FaShare, FaFlag, FaUserPlus } from "react-icons/fa6";
import { QRCodeSVG } from "qrcode.react";
import {
  BottomSheet,
  Button,
  ConfirmInline,
  SheetBody,
  showToast,
} from "@/components/ui";
import type { Match } from "@/lib/data/match-types";
import styles from "./matchMenuSheet.module.scss";

interface Props {
  match: Match;
  /** Only the host may seat a guest — they enter the guest's sends. */
  isHost: boolean;
  onAddGuest: () => void;
  onClose: () => void;
  onEnd: () => void;
  pending: boolean;
}

export function MatchMenuSheet({ match, isHost, onAddGuest, onClose, onEnd, pending }: Props) {
  const [confirming, setConfirming] = useState(false);
  // Lazy initialiser so `window.location.origin` stays out of the
  // render body — `react-hooks/purity` flags direct global reads
  // during render. Computed once on mount; the sheet only exists on
  // the match page where the origin is fixed for the session.
  //
  // Encodes the /match/join?code=… path (NOT /match/{id}). The id-direct
  // path requires the scanner to already be a player, so a fresh
  // scanner gets bounced. The join path runs add_match_player then
  // forwards into the match — which is what "scan the QR to join" is
  // supposed to mean. Matches the share-link behaviour below.
  const [scanUrl] = useState(
    () => `${window.location.origin}/match/join?code=${match.code}`,
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(match.code);
      showToast("Code copied", "success");
    } catch {
      showToast("Couldn't copy — select it manually", "error");
    }
  }

  async function shareLink() {
    const url = `${window.location.origin}/match/join?code=${match.code}`;
    const shareData = {
      title: match.name ?? "Chork match",
      text: `Join my match on Chork — code ${match.code}`,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled — silent.
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied", "success");
      } catch {
        showToast("Couldn't copy — use the code instead", "error");
      }
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Match menu">
      <SheetBody>
        <section className={styles.codeSection}>
          <span className={styles.codeLabel}>Join code</span>
          <span className={styles.code}>{match.code}</span>
          <div className={styles.codeActions}>
            <Button type="button" variant="secondary" onClick={copyCode}>
              <FaCopy aria-hidden /> Copy code
            </Button>
            <Button type="button" variant="secondary" onClick={shareLink}>
              <FaShare aria-hidden /> Share link
            </Button>
          </div>
        </section>

        <section className={styles.qrSection}>
          <span className={styles.codeLabel}>Scan to join</span>
          {/* White panel regardless of theme — scanner contrast
              trumps surface cohesion on this one element (Apple
              Wallet passes do the same). */}
          <div className={styles.qrFrame}>
            <QRCodeSVG
              value={scanUrl}
              size={200}
              level="M"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#111210"
            />
          </div>
          <span className={styles.qrCaption}>
            No need to type — camera does it for you.
          </span>
        </section>

        {/* Guests are the recruiting path: someone climbing with you
            who hasn't got the app still appears on the board, with
            their sends entered by you. Host-only, because the host is
            the one entering them. */}
        {isHost && !confirming && (
          <Button type="button" variant="secondary" onClick={onAddGuest} fullWidth>
            <FaUserPlus aria-hidden /> Add a guest
          </Button>
        )}

        {!confirming ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => setConfirming(true)}
            fullWidth
          >
            <FaFlag aria-hidden /> End match
          </Button>
        ) : (
          <ConfirmInline
            prompt={
              <p>
                End the match for everyone? Final scores will be calculated
                and the match will be closed. This cannot be undone.
              </p>
            }
            confirmLabel="Yes, end match"
            pendingLabel="Ending…"
            onConfirm={onEnd}
            onCancel={() => setConfirming(false)}
            pending={pending}
          />
        )}
      </SheetBody>
    </BottomSheet>
  );
}
