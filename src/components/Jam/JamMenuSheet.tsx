"use client";

import { useState } from "react";
import { FaCopy, FaShare, FaFlag } from "react-icons/fa6";
import { QRCodeSVG } from "qrcode.react";
import {
  BottomSheet,
  Button,
  ConfirmInline,
  SheetBody,
  showToast,
} from "@/components/ui";
import type { Jam } from "@/lib/data/jam-types";
import styles from "./jamMenuSheet.module.scss";

interface Props {
  jam: Jam;
  onClose: () => void;
  onEnd: () => void;
  pending: boolean;
}

export function JamMenuSheet({ jam, onClose, onEnd, pending }: Props) {
  const [confirming, setConfirming] = useState(false);
  // Lazy initialiser so `window.location.origin` stays out of the
  // render body — `react-hooks/purity` flags direct global reads
  // during render. Computed once on mount; the sheet only exists on
  // the jam page where the origin is fixed for the session.
  //
  // Encodes the /jam/join?code=… path (NOT /jam/{id}). The id-direct
  // path requires the scanner to already be a player, so a fresh
  // scanner gets bounced. The join path runs add_jam_player then
  // forwards into the jam — which is what "scan the QR to join" is
  // supposed to mean. Matches the share-link behaviour below.
  const [scanUrl] = useState(
    () => `${window.location.origin}/jam/join?code=${jam.code}`,
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(jam.code);
      showToast("Code copied", "success");
    } catch {
      showToast("Couldn't copy — select it manually", "error");
    }
  }

  async function shareLink() {
    const url = `${window.location.origin}/jam/join?code=${jam.code}`;
    const shareData = {
      title: jam.name ?? "Chork jam",
      text: `Join my jam on Chork — code ${jam.code}`,
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
    <BottomSheet open onClose={onClose} title="Jam menu">
      <SheetBody>
        <section className={styles.codeSection}>
          <span className={styles.codeLabel}>Join code</span>
          <span className={styles.code}>{jam.code}</span>
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

        {!confirming ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => setConfirming(true)}
            fullWidth
          >
            <FaFlag aria-hidden /> End jam
          </Button>
        ) : (
          <ConfirmInline
            prompt={
              <p>
                End the jam for everyone? Final scores will be calculated
                and the jam will be closed. This cannot be undone.
              </p>
            }
            confirmLabel="Yes, end jam"
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
