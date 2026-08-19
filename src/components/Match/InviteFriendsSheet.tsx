"use client";

import { useEffect, useState, useTransition } from "react";
import { FaPaperPlane } from "react-icons/fa6";
import { BottomSheet, Button, SheetBody, showToast, shimmerStyles } from "@/components/ui";
import { ClimberRow } from "@/components/ui/ClimberRow/ClimberRow";
import {
  getInvitableFriends,
  inviteToMatch,
  type InvitableFriend,
} from "@/app/match/actions";
import styles from "./inviteFriendsSheet.module.scss";

interface Props {
  onClose: () => void;
}

/**
 * Invite friends to the match you're in.
 *
 * The join code reaches anyone; this reaches the people who already
 * agreed to hear from you. Each row is one tap, and the tap sends a
 * notification carrying the code — not a seat. They join by their own
 * action or ignore it, so there is nothing here that can be done TO
 * someone (see `inviteToMatch`).
 *
 * The list loads when the sheet opens rather than riding in with the
 * match page: most sessions never open it, and the friends who are
 * already seated or already invited are worked out server-side from
 * the live state at that moment, which a page-load snapshot would
 * have got wrong by the time you tapped.
 */
export function InviteFriendsSheet({ onClose }: Props) {
  const [friends, setFriends] = useState<InvitableFriend[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [sent, setSent] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    startLoad(async () => {
      const r = await getInvitableFriends();
      if ("error" in r) {
        showToast(r.error, "error");
        setFriends([]);
        return;
      }
      setFriends(r.friends);
    });
  }, []);

  function invite(friend: InvitableFriend) {
    startSend(async () => {
      const r = await inviteToMatch(friend.user_id);
      if ("error" in r) return showToast(r.error, "error");
      setSent((prev) => new Set(prev).add(friend.user_id));
    });
  }

  const showEmpty = friends !== null && friends.length === 0 && !loading;

  return (
    <BottomSheet open onClose={onClose} title="Invite friends">
      <SheetBody>
        <p className={styles.hint}>
          They&rsquo;ll get a notification with the join code and can jump
          straight in.
        </p>

        {friends === null ? (
          <ul className={styles.list} aria-busy="true" aria-label="Loading friends">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className={`${styles.placeholder} ${shimmerStyles.skeleton}`} />
            ))}
          </ul>
        ) : showEmpty ? (
          <p className={styles.empty}>
            No friends to invite yet — everyone you&rsquo;re friends with is
            either already in, or you haven&rsquo;t added anyone. The join
            code works for anyone.
          </p>
        ) : (
          <ul className={styles.list}>
            {friends.map((f) => {
              const done = f.invited || sent.has(f.user_id);
              return (
                <li key={f.user_id}>
                  <ClimberRow
                    climber={f}
                    note={done ? "Invited" : undefined}
                    actions={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => invite(f)}
                        disabled={sending}
                        aria-label={`Invite @${f.username ?? "unknown"}`}
                      >
                        <FaPaperPlane aria-hidden /> Invite
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </SheetBody>
    </BottomSheet>
  );
}
