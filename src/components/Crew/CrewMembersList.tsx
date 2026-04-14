"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FaUserPlus, FaRightFromBracket, FaCrown } from "react-icons/fa6";
import { UserAvatar, Button, showToast } from "@/components/ui";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ClimberSearch } from "./ClimberSearch";
import { leaveCrew, transferCrewOwnership } from "@/app/crew/actions";
import type { Crew, CrewMember } from "@/lib/data/crew-queries";
import styles from "./crewMembersList.module.scss";

interface Props {
  crew: Crew;
  members: CrewMember[];
  currentUserId: string;
  /** All the viewer's crews — passed through to the invite picker
   *  so "invite to a different crew" is still one tap away. */
  myCrews: Crew[];
}

/**
 * Members tab on the crew detail page. Lists active members with
 * the creator flagged, exposes an "Invite" button that opens the
 * climber search sheet, and a "Leave crew" action for non-creators.
 */
export function CrewMembersList({
  crew,
  members,
  currentUserId,
  myCrews,
}: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [transferTarget, setTransferTarget] = useState<CrewMember | null>(null);
  const [pending, startTransition] = useTransition();

  const isCreator = crew.created_by === currentUserId;
  const isMember = members.some((m) => m.user_id === currentUserId);

  function handleLeave() {
    startTransition(async () => {
      const res = await leaveCrew(crew.id);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Left crew", "info");
      setConfirmLeave(false);
      // Page revalidates on leave; parent rerenders without this crew.
    });
  }

  function handleTransfer() {
    if (!transferTarget) return;
    const target = transferTarget;
    startTransition(async () => {
      const res = await transferCrewOwnership(crew.id, target.user_id);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`@${target.username} is now the crew creator`, "success");
      setTransferTarget(null);
    });
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.heading}>
            {members.length} member{members.length === 1 ? "" : "s"}
          </h2>
          <Button variant="secondary" onClick={() => setInviteOpen(true)}>
            <FaUserPlus aria-hidden /> Invite
          </Button>
        </div>

        <ul className={styles.list} aria-label="Crew members">
          {members.map((m) => {
            const isRowCreator = m.user_id === crew.created_by;
            const canTransferToThis = isCreator && !isRowCreator;
            return (
              <li key={m.user_id} className={styles.rowWrap}>
                <Link
                  href={`/u/${m.username}`}
                  className={styles.row}
                  aria-label={`Open @${m.username}'s profile`}
                >
                  <UserAvatar
                    user={{
                      id: m.user_id,
                      username: m.username,
                      name: m.name,
                      avatar_url: m.avatar_url,
                    }}
                    size={40}
                  />
                  <div className={styles.rowText}>
                    <span className={styles.rowName}>@{m.username}</span>
                    {m.name && <span className={styles.rowSub}>{m.name}</span>}
                  </div>
                  {isRowCreator && (
                    <span className={styles.badgeCreator}>Creator</span>
                  )}
                </Link>

                {canTransferToThis && (
                  <button
                    type="button"
                    className={styles.transferBtn}
                    onClick={() => setTransferTarget(m)}
                    aria-label={`Make @${m.username} the crew creator`}
                    disabled={pending}
                  >
                    <FaCrown aria-hidden /> Make creator
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isMember && !isCreator && (
          <Button
            variant="secondary"
            onClick={() => setConfirmLeave(true)}
            fullWidth
          >
            <FaRightFromBracket aria-hidden /> Leave crew
          </Button>
        )}
      </section>

      <BottomSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite to crew"
        description="Search for a climber to invite"
      >
        <ClimberSearch
          currentUserId={currentUserId}
          myCrews={myCrews}
          onCreateCrew={() => { /* not offered inside invite flow */ }}
          autoFocus
        />
      </BottomSheet>

      <BottomSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave this crew?"
      >
        <div className={styles.confirmBody}>
          <p className={styles.confirmText}>
            You&apos;ll stop appearing in{" "}
            <span className={styles.confirmCrew}>{crew.name}</span>&apos;s
            leaderboard and your mates&apos; activity feed.
          </p>
          <Button
            variant="danger"
            onClick={handleLeave}
            disabled={pending}
            fullWidth
          >
            {pending ? "Leaving…" : "Leave crew"}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        title="Make them the creator?"
      >
        {transferTarget && (
          <div className={styles.confirmBody}>
            <p className={styles.confirmText}>
              <span className={styles.confirmCrew}>@{transferTarget.username}</span>{" "}
              will take over as the creator of{" "}
              <span className={styles.confirmCrew}>{crew.name}</span>. You&apos;ll
              stay a regular member until you leave.
            </p>
            <Button
              onClick={handleTransfer}
              disabled={pending}
              fullWidth
            >
              {pending ? "Transferring…" : "Make creator"}
            </Button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
