"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FaUserPlus,
  FaUserCheck,
  FaUserMinus,
  FaClock,
  FaCheck,
} from "react-icons/fa6";
import { showToast, UserAvatar } from "@/components/ui";
import Link from "next/link";
import { requestFriend, respondToFriend, removeFriend } from "@/app/friends/actions";
import type { FriendStanding } from "@/lib/data/friend-queries";
import styles from "./profileActions.module.scss";


interface Props {
  userId: string;
  username: string;
  standing: FriendStanding;
}

/**
 * What you can do about the climber whose profile you're looking at.
 *
 * Six states from `friend_status`, because "Add friend" is right in
 * exactly one of them and offering it in the others is how an app
 * teaches you not to trust its buttons — `request_friend` is
 * idempotent, so tapping Add on someone you already asked does nothing
 * visible and you learn to stop reading.
 *
 *   self            settings; nothing social
 *   none            ask them
 *   sent            you already did — a label, not a dead button
 *   received        THEY asked; Accept is the action, not asking back
 *   friends         yours already; the primary flips to climbing together
 *   declined_by_me  you said no and may change your mind
 *
 * State is held locally and advanced on success rather than waiting on
 * a refresh, so Add → "Request sent" is one paint. The friends row's
 * id rides along in `standing` because Accept needs it, and Remove
 * confirms in place — one mis-tap should not sever a friendship.
 */
export function ProfileActions({ userId, username, standing: initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [standing, setStanding] = useState(initial);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const fail = (msg: string) => showToast(msg, "error");

  function add() {
    startTransition(async () => {
      const r = await requestFriend(userId);
      if ("error" in r) return fail(r.error);
      // A `declined` row means the RPC silently refused — the other
      // climber declined you and must not learn that from a toast.
      // Reading as "sent" keeps the decline invisible from this side.
      setStanding({ status: "sent", friendId: null });
      showToast(`Request sent to @${username}`, "success");
    });
  }

  function accept() {
    if (!standing.friendId) return;
    const friendId = standing.friendId;
    startTransition(async () => {
      const r = await respondToFriend(friendId, true);
      if ("error" in r) return fail(r.error);
      setStanding({ status: "friends", friendId });
      showToast(`You and @${username} are friends`, "success");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await removeFriend(userId);
      if ("error" in r) return fail(r.error);
      setStanding({ status: "none", friendId: null });
      setConfirmingRemove(false);
      showToast(`Removed @${username}`, "success");
      router.refresh();
    });
  }

  // Your own profile has no social row: Friends is a nav tab, and a
  // second door here was a button looking for a job. Settings lives
  // in the hero's corner (SettingsCorner).
  if (standing.status === "self") return null;

  return (
    <div className={styles.row}>
      {(standing.status === "none" || standing.status === "declined_by_me") && (
        // `declined_by_me` reads as a fresh ask, not "undo": the other
        // climber was never told, so from their side nothing happened.
        <button
          type="button"
          className={standing.status === "none" ? styles.primary : styles.secondary}
          onClick={add}
          disabled={pending}
        >
          <FaUserPlus aria-hidden />
          <span>Add friend</span>
        </button>
      )}

      {standing.status === "sent" && (
        // Nothing to do but wait. A disabled control that still looks
        // tappable is worse than a label that admits it.
        <span className={styles.pending}>
          <FaClock aria-hidden />
          <span>Request sent</span>
        </span>
      )}

      {standing.status === "received" && (
        <button
          type="button"
          className={styles.primary}
          onClick={accept}
          disabled={pending}
        >
          <FaCheck aria-hidden />
          <span>Accept request</span>
        </button>
      )}

      {standing.status === "friends" && !confirmingRemove && (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setConfirmingRemove(true)}
          aria-label={`Friends with @${username}. Tap to remove.`}
        >
          <FaUserCheck aria-hidden />
          <span>Friends</span>
        </button>
      )}

      {standing.status === "friends" && confirmingRemove && (
        // Confirm in place rather than a modal: it is one more tap, on
        // the same spot, and it reads as what it is.
        <button
          type="button"
          className={styles.danger}
          onClick={remove}
          onBlur={() => setConfirmingRemove(false)}
          disabled={pending}
          autoFocus
        >
          <FaUserMinus aria-hidden />
          <span>Remove friend?</span>
        </button>
      )}

    </div>
  );
}
