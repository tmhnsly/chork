"use client";

import { useState } from "react";
import { FaUserPlus, FaCheck, FaShareNodes } from "react-icons/fa6";
import { showToast } from "@/components/ui";
import styles from "./inviteCard.module.scss";

interface Props {
  gymName: string;
}

/**
 * Invite CTA — prompts the viewer to pull more climbers from their gym
 * onto the Chorkboard. No server-side invite system yet; this copies a
 * deep link to the current page (which will redirect to signup if the
 * visitor isn't authed) and opens the native share sheet when supported.
 */
export function InviteCard({ gymName }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = typeof window === "undefined" ? "" : window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Chork",
          text: `Come climb on the Chorkboard at ${gymName}.`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast("Invite link copied", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // User dismissed share sheet or clipboard unavailable — silent.
    }
  }

  return (
    <section className={styles.card} aria-labelledby="invite-heading">
      <div className={styles.icon} aria-hidden>
        <FaUserPlus />
      </div>
      <div className={styles.text}>
        <h2 id="invite-heading" className={styles.heading}>Bring the crew</h2>
        <p className={styles.body}>
          Share Chork with your {gymName} mates to see them on the board.
        </p>
      </div>
      <button type="button" className={styles.cta} onClick={handleCopy}>
        {copied ? <FaCheck aria-hidden /> : <FaShareNodes aria-hidden />}
        <span>{copied ? "Copied" : "Share"}</span>
      </button>
    </section>
  );
}
