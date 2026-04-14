"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FaUserPlus, FaRightFromBracket } from "react-icons/fa6";
import { UserAvatar, Button, showToast } from "@/components/ui";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ClimberSearch } from "./ClimberSearch";
import { leaveCrew } from "@/app/crew/actions";
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
          {members.map((m) => (
            <li key={m.user_id}>
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
                {m.user_id === crew.created_by && (
                  <span className={styles.badgeCreator}>Creator</span>
                )}
              </Link>
            </li>
          ))}
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
    </>
  );
}
