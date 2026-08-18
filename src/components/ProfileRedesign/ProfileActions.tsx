"use client";

import { FaUserPlus, FaUserCheck, FaBolt, FaGear, FaClock } from "react-icons/fa6";
import type { ProfileMockData } from "./types";
import styles from "./profileActions.module.scss";

/**
 * What you can do about the person whose profile you're looking at.
 *
 * The gap this fills: a profile currently offers nothing. You can see
 * a climber, and there is no way to add them, no way to pull them into
 * a match, no way to remove them — the social loop dead-ends on the
 * one screen where acting on it is the obvious thing to want.
 *
 * Four states, because "add friend" is only correct in one of them,
 * and showing it in the others is how an app teaches you not to trust
 * its buttons:
 *
 *   self       — settings, and nothing social
 *   stranger   — add them
 *   requested  — you already asked; say so and stop offering
 *   friend     — the interesting one: they are already yours, so the
 *                primary action becomes climbing together
 *
 * Shared by both mockups so the comparison is about layout, not about
 * one of them having better buttons.
 */
export function ProfileActions({
  relation,
  compact = false,
}: {
  relation: ProfileMockData["relation"];
  /** Icon-only, for sitting beside a name rather than under it. */
  compact?: boolean;
}) {
  if (relation === "self") {
    return (
      <div className={`${styles.row} ${compact ? styles.compact : ""}`}>
        <button type="button" className={styles.secondary} aria-label="Settings">
          <FaGear aria-hidden />
          {!compact && <span>Settings</span>}
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.row} ${compact ? styles.compact : ""}`}>
      {relation === "stranger" && (
        <button type="button" className={styles.primary}>
          <FaUserPlus aria-hidden />
          {!compact && <span>Add friend</span>}
        </button>
      )}

      {relation === "requested" && (
        // Not a button. There is nothing to do but wait, and a
        // disabled control that looks tappable is worse than a label.
        <span className={styles.pending}>
          <FaClock aria-hidden />
          {!compact && <span>Request sent</span>}
        </span>
      )}

      {relation === "friend" && (
        <button type="button" className={styles.secondary}>
          <FaUserCheck aria-hidden />
          {!compact && <span>Friends</span>}
        </button>
      )}

      {/* Inviting someone to a match does not require them to be a
          friend — a match is the thing that MAKES you friends here
          (suggestions come from shared matches), so gating it behind
          the link you are trying to create would close the loop it
          exists to open. */}
      <button
        type="button"
        className={relation === "friend" ? styles.primary : styles.secondary}
      >
        <FaBolt aria-hidden />
        {!compact && <span>Invite to match</span>}
      </button>
    </div>
  );
}
