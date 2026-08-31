"use client";

import { useState, useTransition } from "react";
import { seatAvatarUser, seatName } from "@/lib/data/seat";
import { useRouter } from "next/navigation";
import { FaCopy, FaXmark, FaCrown, FaPaperPlane } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import { Button, UserAvatar, Username, showToast } from "@/components/ui";
import { sendAdminInvite, cancelAdminInvite } from "@/app/admin/invites-actions";
import type { GymTeamMember, GymPendingInvite } from "@/lib/data/admin-queries";
import styles from "./adminTeam.module.scss";

interface Props {
  gymId: string;
  /** Only an owner may invite another owner — the server enforces it
   *  too; this just stops offering a choice that will be refused. */
  isOwner: boolean;
  team: GymTeamMember[];
  invites: GymPendingInvite[];
}

/**
 * The send half of the invite journey.
 *
 * Acceptance has always worked (`/admin/invite/[token]`), and both
 * server actions were written and tested — they simply had no caller,
 * so an invite could be accepted but never issued.
 *
 * The invite link is shown for copying rather than emailed: delivery
 * is a later phase, and `sendAdminInvite` returns the URL precisely so
 * this screen can hand it over in the meantime. Saying that plainly
 * beats a "sent!" toast for a mail that never goes out.
 */
export function AdminTeam({ gymId, isOwner, team, invites }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "owner">("admin");
  // The URL from the last successful invite, kept on screen until the
  // next action — losing it means the invite exists and nobody can
  // reach it, since there is no email yet.
  const [lastLink, setLastLink] = useState<string | null>(null);

  function handleInvite() {
    startTransition(async () => {
      const result = await sendAdminInvite({ gymId, email, role });
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      setLastLink(result.inviteUrl);
      setEmail("");
      showToast("Invite created — copy the link below", "success");
      router.refresh();
    });
  }

  function handleCancel(inviteId: string) {
    startTransition(async () => {
      const result = await cancelAdminInvite(inviteId);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      showToast("Invite cancelled", "success");
      router.refresh();
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied", "success");
    } catch {
      // Clipboard is permission-gated and refuses outside a user
      // gesture in some browsers. The link is on screen either way.
      showToast("Couldn't copy — select the link instead", "error");
    }
  }

  return (
    <div className={styles.sections}>
      <section className={styles.card} aria-labelledby="team-heading">
        <h2 id="team-heading" className={styles.heading}>
          Admins
        </h2>
        <ul className={styles.list}>
          {team.map((member) => (
            <li key={member.user_id} className={styles.row}>
              <UserAvatar user={seatAvatarUser(member)} size="row" />
              <div className={styles.identity}>
                <span className={styles.name}>
                  {seatName(member, { fallback: "Admin" })}
                </span>
                {member.username && (
                  <Username username={member.username} className={styles.handle} />
                )}
              </div>
              <span
                className={`${styles.role} ${member.role === "owner" ? styles.roleOwner : ""}`}
              >
                {member.role === "owner" && <FaCrown aria-hidden />}
                {member.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card} aria-labelledby="invite-heading">
        <h2 id="invite-heading" className={styles.heading}>
          Invite someone
        </h2>

        <div className={styles.inviteForm}>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="them@theirgym.com"
              autoComplete="off"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Role</span>
            <select
              className={styles.select}
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "owner")}
            >
              <option value="admin">Admin</option>
              {/* Owners only. The server refuses it regardless, so this
                  is about not offering a dead choice. */}
              {isOwner && <option value="owner">Owner</option>}
            </select>
          </label>

          <Button
            type="button"
            onClick={handleInvite}
            disabled={pending || !email.trim()}
          >
            <FaPaperPlane aria-hidden /> Create invite
          </Button>
        </div>

        {lastLink && (
          <div className={styles.linkBox}>
            <p className={styles.linkNote}>
              Send them this link — invite emails aren&rsquo;t wired up yet.
            </p>
            <div className={styles.linkRow}>
              <code className={styles.link}>{lastLink}</code>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => copy(lastLink)}
                aria-label="Copy invite link"
              >
                <FaCopy aria-hidden />
              </button>
            </div>
          </div>
        )}
      </section>

      {invites.length > 0 && (
        <section className={styles.card} aria-labelledby="pending-heading">
          <h2 id="pending-heading" className={styles.heading}>
            Pending invites
          </h2>
          <ul className={styles.list}>
            {invites.map((invite) => (
              <li key={invite.id} className={styles.row}>
                <div className={styles.identity}>
                  <span className={styles.name}>{invite.email}</span>
                  <span className={styles.handle}>
                    {invite.role}
                    {" · "}
                    {invite.expired
                      ? "expired"
                      : `expires ${format(parseISO(invite.expires_at), "d MMM")}`}
                  </span>
                </div>
                {/* Expired invites are listed, not hidden: "why has
                    nothing happened" is answered by seeing it sat
                    there. Re-inviting the same email refreshes the
                    window rather than erroring. */}
                {invite.expired && <span className={styles.expired}>Expired</span>}
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => handleCancel(invite.id)}
                  disabled={pending}
                  aria-label={`Cancel invite to ${invite.email}`}
                >
                  <FaXmark aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
