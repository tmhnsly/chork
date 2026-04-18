"use client";

import { useState } from "react";
import { FaCopy, FaShare, FaFlag } from "react-icons/fa6";
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
