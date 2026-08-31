"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { IconType } from "react-icons";
import { FaUserPlus, FaCheck, FaXmark, FaBolt } from "react-icons/fa6";
import { Username } from "@/components/ui/Username";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { NotificationRow } from "@/lib/data/notifications";
import {
  renderNotificationInApp,
  type NotificationIcon,
  type NotificationKind,
  type NotificationSegment,
} from "@/lib/data/notification-kinds";
import {
  markAllNotificationsRead,
  dismissNotification,
} from "@/app/notifications-actions";
import styles from "./notificationsList.module.scss";

interface Props {
  /** Server-fetched rows for this section's kinds, newest first. */
  rows: NotificationRow[];
  /** The kinds this list owns — the mark-read scope. */
  kinds: NotificationKind[];
}

/**
 * The client half of `SectionNotifications`: renders the rows the
 * server fetched, owns optimistic dismiss, and read-flags ONLY this
 * section's kinds once per mount — visiting /friends never marks a
 * match invite read. Rows keep their unread tint for the visit that
 * caught them up; the flag is for the next one.
 */
export function NotificationsList({ rows, kinds }: Props) {
  const [, startTransition] = useTransition();
  const [visible, setVisible] = useState(rows);

  // Once per mount, and only when something is actually unread.
  const markedRef = useRef(false);
  const hasUnread = rows.some((r) => r.read_at === null);
  useEffect(() => {
    if (markedRef.current || !hasUnread) return;
    markedRef.current = true;
    startTransition(() => {
      // Fire-and-forget — a failure just leaves rows unread for the
      // next visit to catch up on.
      void markAllNotificationsRead(kinds);
    });
    // `kinds` is a per-section constant; the ref guards re-fires.
  }, [hasUnread, kinds]);

  if (visible.length === 0) return null;

  return (
    <ul className={styles.list}>
      {visible.map((n) => (
        <NotificationRowView
          key={n.id}
          row={n}
          onDismissed={(id) =>
            setVisible((prev) => prev.filter((r) => r.id !== id))
          }
        />
      ))}
    </ul>
  );
}

// ── Per-row rendering ─────────────────────────────────

// Exhaustive over the table's icon keys — a new `NotificationIcon`
// value in notification-kinds.ts fails the build here until it gets
// a component. Kinds that reuse an existing key need nothing.
const KIND_ICONS: Record<NotificationIcon, IconType> = {
  "user-plus": FaUserPlus,
  bolt: FaBolt,
  check: FaCheck,
};

/**
 * Generic segment → JSX mapping. Per-kind copy lives as structured
 * data in the kind table; this is the only place segments become
 * markup. `user` segments render through `<Username>`, which owns the
 * `@` prefix (domain rule: usernames always display with `@`) and the
 * break points, so a long handle wraps here the same way it does on
 * the leaderboard.
 */
function SegmentedTitle({ segments }: { segments: NotificationSegment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.type === "text" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : (
          <strong key={i}>
            <Username username={s.username} />
          </strong>
        ),
      )}
    </>
  );
}

function NotificationRowView({
  row,
  onDismissed,
}: {
  row: NotificationRow;
  onDismissed: (id: string) => void;
}) {
  const [, startTransition] = useTransition();

  // `relative()` calls formatDistanceToNow → new Date() internally,
  // which CLAUDE.md flags as a render-body impurity in "use client"
  // components. Memoise on the row's created_at so the comparison
  // happens once per mount; the relative-time string drifts but for
  // a list of recent items the difference is invisible.
  const when = useMemo(() => relative(row.created_at), [row.created_at]);

  // Single typed seam: the kind table narrows payload by kind. An
  // unknown/future kind (DB constraint newer than this bundle)
  // returns null — skip the row gracefully rather than guess at copy.
  const content = renderNotificationInApp(row.kind, row.payload);
  if (!content) return null;

  const Icon = KIND_ICONS[content.icon];
  const unread = row.read_at === null;

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Optimistic removal so the row vanishes immediately; the server
    // action confirms in the background.
    onDismissed(row.id);
    startTransition(() => {
      void dismissNotification(row.id);
    });
  }

  return (
    <li className={`${styles.row} ${unread ? styles.rowUnread : ""}`}>
      <Link href={content.href} className={styles.rowLink}>
        <span className={styles.rowIcon} aria-hidden>
          <Icon />
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>
            <SegmentedTitle segments={content.segments} />
          </span>
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

// CLAUDE.md's "coarse timestamp" rule is narrowly about the friends
// ACTIVITY feed — climbers shouldn't be able to infer when their
// mates are physically at the gym. Notifications are personal to
// the signed-in viewer; "10 minutes ago" on your OWN invite ping
// doesn't leak anything. Fine to use minute-accurate distance here.
function relative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
