"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaUser, FaBell, FaEye } from "react-icons/fa6";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { NotificationsSheet } from "@/components/Notifications/NotificationsSheet";
import { getPendingCrewInvites } from "@/lib/data/crew-queries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { PendingInvite } from "@/lib/data/crew-queries";
import styles from "./profileMenu.module.scss";

interface Props {
  userId: string;
  username: string;
  profileActive: boolean;
  badgeCount: number;
  tabClassName: string;
  tabIconWrapClassName: string;
  tabIconClassName: string;
  tabLabelClassName: string;
  tabDotClassName: string;
}

/**
 * Profile tab dropdown — available from anywhere in the app so
 * climbers don't have to visit /u/username to open their inbox.
 * Two entries:
 *   • View profile → /u/username
 *   • Notifications → opens the existing NotificationsButton sheet
 *     with the same pending-invite data
 *
 * Settings still lives on the profile page for now; a future pass
 * will migrate those items (change-gym, allow-invites, push toggle,
 * theme, sign out, delete account) into a nested submenu here.
 */
export function ProfileMenu({
  userId,
  username,
  profileActive,
  badgeCount,
  tabClassName,
  tabIconWrapClassName,
  tabIconClassName,
  tabLabelClassName,
  tabDotClassName,
}: Props) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Client-fetched because the nav mounts across every authed route
  // and we don't want to push invite data through a server-side
  // layout prop chain. Runs once per userId; revalidates through the
  // component re-render that a crew mutation triggers downstream.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const rows = await getPendingCrewInvites(supabase, userId);
      if (!cancelled) setInvites(rows);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const triggerCls = [
    tabClassName,
    profileActive ? styles.active : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            className={triggerCls}
            aria-label="Profile menu"
          >
            <span className={tabIconWrapClassName}>
              <FaUser className={tabIconClassName} />
              {badgeCount > 0 && <span className={tabDotClassName} aria-hidden />}
            </span>
            <span className={tabLabelClassName}>Profile</span>
          </button>
        </Dropdown.Trigger>

        <Dropdown.Portal>
          <Dropdown.Content
            className={styles.menu}
            side="top"
            align="end"
            sideOffset={8}
          >
            <Dropdown.Item asChild className={styles.item}>
              <Link href={`/u/${username}`}>
                <FaEye aria-hidden className={styles.itemIcon} />
                View profile
              </Link>
            </Dropdown.Item>

            <Dropdown.Item
              className={styles.item}
              onSelect={(e) => {
                e.preventDefault();
                setNotificationsOpen(true);
              }}
            >
              <FaBell aria-hidden className={styles.itemIcon} />
              Notifications
              {badgeCount > 0 && (
                <span className={styles.itemCount}>{badgeCount}</span>
              )}
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      <NotificationsSheet
        invites={invites}
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </>
  );
}
