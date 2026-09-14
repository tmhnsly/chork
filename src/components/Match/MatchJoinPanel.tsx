"use client";

import { useState } from "react";
import { FaCopy, FaShare, FaUserPlus, FaPaperPlane } from "react-icons/fa6";
import { QRCodeSVG } from "qrcode.react";
import { Button, showToast } from "@/components/ui";
import type { Match } from "@/lib/data/match-types";
import { matchTitle } from "@/lib/data/match-title";
import styles from "./matchJoinPanel.module.scss";

interface Props {
  match: Match;
  /** Only the host may seat a guest — they enter the guest's sends. */
  isHost: boolean;
  /** Anyone in the match can invite their friends. */
  onInviteFriends: () => void;
  onAddGuest: () => void;
}

/**
 * How people get in: the code, the QR, a share link, friends, a
 * guest seat. The lobby shows it as a card — in the lobby it is the
 * whole job — and once the match is under way the Invite pill opens
 * the same thing as a sheet.
 */
export function MatchJoinPanel({ match, isHost, onInviteFriends, onAddGuest }: Props) {
  // Lazy initialiser so `window.location.origin` stays out of the
  // render body — `react-hooks/purity` flags direct global reads
  // during render. Computed once on mount; the panel only exists on
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
      title: matchTitle(match),
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
    <div className={styles.panel}>
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
        {/* White panel regardless of theme — scanner contrast trumps
            surface cohesion on this one element (Apple Wallet passes
            do the same). */}
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

      {/* The code reaches anyone; this reaches the people who already
          agreed to hear from you. Everyone in the match can invite —
          it sends a notification, not a seat, so there is nothing
          for it to be host-only ABOUT. */}
      <Button type="button" variant="secondary" onClick={onInviteFriends} fullWidth>
        <FaPaperPlane aria-hidden /> Invite friends
      </Button>

      {/* Guests are the recruiting path: someone climbing with you
          who hasn't got the app still appears on the board, with
          their sends entered by you. Host-only, because the host is
          the one entering them. */}
      {isHost && (
        <Button type="button" variant="secondary" onClick={onAddGuest} fullWidth>
          <FaUserPlus aria-hidden /> Add a guest
        </Button>
      )}
    </div>
  );
}
