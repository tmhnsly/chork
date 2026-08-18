"use client";

import {
  FaUserPlus,
  FaUserCheck,
  FaBolt,
  FaGear,
  FaClock,
  FaCheck,
} from "react-icons/fa6";
import type { ProfileMockData } from "./types";
import styles from "./profileActions.module.scss";

/**
 * What you can do about the climber whose profile you're looking at.
 *
 * The gap this fills: a profile currently offers nothing. You can see
 * someone and there is no way to add them, pull them into a match, or
 * tell that you already asked — the social loop dead-ends on the one
 * screen where acting on it is the obvious want.
 *
 * Six states, from `friend_status` (migration 124), because "Add
 * friend" is correct in exactly one. Offering it in the others is how
 * an app teaches you not to trust its buttons: `request_friend` is
 * idempotent, so tapping Add on someone you already asked does nothing
 * visible and you learn to stop reading.
 *
 *   self           settings, nothing social
 *   none           ask them
 *   sent           you already did — a label, not a dead button
 *   received       THEY asked; accepting is the action, not asking back
 *   friends        already yours, so the primary becomes climbing together
 *   declined_by_me you said no and may change your mind
 */
export function ProfileActions({
  relation,
}: {
  relation: ProfileMockData["relation"];
}) {
  if (relation === "self") {
    return (
      <div className={styles.row}>
        <button type="button" className={styles.secondary}>
          <FaGear aria-hidden />
          <span>Settings</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      {relation === "none" && (
        <button type="button" className={styles.primary}>
          <FaUserPlus aria-hidden />
          <span>Add friend</span>
        </button>
      )}

      {relation === "declined_by_me" && (
        // Worded as a fresh ask rather than "undo": the other climber
        // was never told, so from their side nothing happened.
        <button type="button" className={styles.secondary}>
          <FaUserPlus aria-hidden />
          <span>Add friend</span>
        </button>
      )}

      {relation === "sent" && (
        // Nothing to do but wait. A disabled control that still looks
        // tappable is worse than a label that admits it.
        <span className={styles.pending}>
          <FaClock aria-hidden />
          <span>Request sent</span>
        </span>
      )}

      {relation === "received" && (
        <button type="button" className={styles.primary}>
          <FaCheck aria-hidden />
          <span>Accept request</span>
        </button>
      )}

      {relation === "friends" && (
        <button type="button" className={styles.secondary}>
          <FaUserCheck aria-hidden />
          <span>Friends</span>
        </button>
      )}

      {/* Inviting is deliberately NOT gated on friendship. Suggestions
          come from shared matches, so a match is the thing that MAKES
          you friends here — requiring the link first would close the
          loop it exists to open. */}
      <button
        type="button"
        className={relation === "friends" ? styles.primary : styles.secondary}
      >
        <FaBolt aria-hidden />
        <span>Invite to match</span>
      </button>
    </div>
  );
}
