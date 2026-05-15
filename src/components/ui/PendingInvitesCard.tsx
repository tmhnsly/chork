"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaCheck, FaXmark } from "react-icons/fa6";
import { showToast } from "@/components/ui";
import type { PendingInvite } from "@/lib/data/crew-queries";
import { acceptCrewInvite, declineCrewInvite } from "@/app/crew/actions";
import styles from "./pendingInvitesCard.module.scss";

interface Props {
  invites: PendingInvite[];
}

export function PendingInvitesCard({ invites }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);

  function handleAccept(invite: PendingInvite) {
    setWorking(invite.id);
    startTransition(async () => {
      const res = await acceptCrewInvite(invite.id);
      setWorking(null);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`Joined ${invite.crew_name}`, "success");
      router.refresh();
    });
  }

  function handleDecline(invite: PendingInvite) {
    setWorking(invite.id);
    startTransition(async () => {
      const res = await declineCrewInvite(invite.id);
      setWorking(null);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`Declined ${invite.crew_name}`, "info");
      router.refresh();
    });
  }

  return (
    <section className={styles.card} aria-labelledby="pending-invites-heading">
      <h2 id="pending-invites-heading" className={styles.heading}>
        Crew invites
      </h2>
      <ul className={styles.list}>
        {invites.map((invite) => {
          const busy = pending && working === invite.id;
          return (
            <li key={invite.id} className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.crewName}>{invite.crew_name}</span>
                <span className={styles.rowMeta}>
                  from <strong>@{invite.invited_by_username}</strong>
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.decline}
                  onClick={() => handleDecline(invite)}
                  disabled={busy}
                  aria-label={`Decline ${invite.crew_name}`}
                >
                  <FaXmark />
                </button>
                <button
                  type="button"
                  className={styles.accept}
                  onClick={() => handleAccept(invite)}
                  disabled={busy}
                  aria-label={`Accept ${invite.crew_name}`}
                >
                  <FaCheck />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
