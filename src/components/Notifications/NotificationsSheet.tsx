"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import {
  FaUserPlus,
  FaCheck,
  FaCrown,
  FaXmark,
} from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PendingInvitesCard } from "@/components/Crew/PendingInvitesCard";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { PendingInvite } from "@/lib/data/crew-queries";
import type {
  NotificationRow,
  CrewInviteReceivedPayload,
  CrewInviteAcceptedPayload,
  CrewOwnershipTransferredPayload,
} from "@/lib/data/notifications";
import {
  markAllNotificationsRead,
  dismissNotification,
} from "@/app/notifications-actions";
import styles from "./notificationsSheet.module.scss";

interface Props {
  invites: PendingInvite[];
  notifications?: NotificationRow[];
  open: boolean;
  onClose: () => void;
}

/**
 * Notification sheet — opened from the profile header's bell button.
 *
 * Sections:
 *   • Crew invites — accept/decline surface (source of truth in
 *     `crew_members.status = pending`; notification rows are logs).
 *   • Activity log — every past push-worthy event, deep-linked.
 *
 * Opening the sheet fires a server action that marks every unread
 * notification as read. The bell's dot clears on the next
 * revalidation — climbers always return to a tidy bell.
 */
export function NotificationsSheet({
  invites,
  notifications = [],
  open,
  onClose,
}: Props) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const hasUnread = notifications.some((n) => n.read_at === null);
    if (!hasUnread) return;
    startTransition(() => {
      // Fire-and-forget — errors surface as console warnings, bell
      // just stays lit until the next successful open.
      void markAllNotificationsRead();
    });
  }, [open, notifications]);

  if (!open) return null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Notifications"
      description="Crew invites and activity"
    >
      <div className={styles.sheet}>
        {invites.length > 0 ? (
          <PendingInvitesCard invites={invites} />
        ) : (
          <section className={styles.section} aria-label="Crew invites">
            <h2 className={styles.sectionHeading}>Crew invites</h2>
            <p className={styles.empty}>No pending invites.</p>
          </section>
        )}

        <section className={styles.section} aria-label="Recent activity">
          <h2 className={styles.sectionHeading}>Activity</h2>
          {notifications.length === 0 ? (
            <p className={styles.empty}>
              Nothing to catch up on — you&apos;re all square.
            </p>
          ) : (
            <ul className={styles.list}>
              {notifications.map((n) => (
                <NotificationRowView key={n.id} row={n} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}

// ── Per-row rendering ─────────────────────────────────
function NotificationRowView({ row }: { row: NotificationRow }) {
  const when = relative(row.created_at);

  switch (row.kind) {
    case "crew_invite_received":
      return (
        <Row
          row={row}
          icon={<FaUserPlus />}
          href={`/crew`}
          title={
            <>
              <strong>
                @{(row.payload as CrewInviteReceivedPayload).inviter_username}
              </strong>{" "}
              invited you to{" "}
              <strong>
                {(row.payload as CrewInviteReceivedPayload).crew_name}
              </strong>
            </>
          }
          when={when}
        />
      );
    case "crew_invite_accepted":
      return (
        <Row
          row={row}
          icon={<FaCheck />}
          href={`/crew/${(row.payload as CrewInviteAcceptedPayload).crew_id}`}
          title={
            <>
              <strong>
                @{(row.payload as CrewInviteAcceptedPayload).accepter_username}
              </strong>{" "}
              joined{" "}
              <strong>
                {(row.payload as CrewInviteAcceptedPayload).crew_name}
              </strong>
            </>
          }
          when={when}
        />
      );
    case "crew_ownership_transferred":
      return (
        <Row
          row={row}
          icon={<FaCrown />}
          href={`/crew/${(row.payload as CrewOwnershipTransferredPayload).crew_id}`}
          title={
            <>
              <strong>
                @{(row.payload as CrewOwnershipTransferredPayload).from_username}
              </strong>{" "}
              made you the creator of{" "}
              <strong>
                {(row.payload as CrewOwnershipTransferredPayload).crew_name}
              </strong>
            </>
          }
          when={when}
        />
      );
  }
}

function Row({
  row,
  icon,
  href,
  title,
  when,
}: {
  row: NotificationRow;
  icon: React.ReactNode;
  href: string;
  title: React.ReactNode;
  when: string;
}) {
  const [, startTransition] = useTransition();

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(() => {
      void dismissNotification(row.id);
    });
  }

  const unread = row.read_at === null;

  return (
    <li className={`${styles.row} ${unread ? styles.rowUnread : ""}`}>
      <Link href={href} className={styles.rowLink}>
        <span className={styles.rowIcon} aria-hidden>{icon}</span>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          <span className={styles.rowWhen}>{when}</span>
        </span>
      </Link>
      <button
        type="button"
        className={styles.rowDismiss}
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        <FaXmark aria-hidden />
      </button>
    </li>
  );
}

function relative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
