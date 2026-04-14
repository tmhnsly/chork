"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FaUser,
  FaBell,
  FaBellSlash,
  FaEye,
  FaGear,
  FaPen,
  FaRightLeft,
  FaUsers,
  FaUsersSlash,
  FaPalette,
  FaCheck,
  FaShieldHalved,
  FaRightFromBracket,
  FaTrash,
} from "react-icons/fa6";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { NotificationsSheet } from "@/components/Notifications/NotificationsSheet";
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import { GymSwitcherSheet } from "@/components/GymSwitcher/GymSwitcherSheet";
import { InstallPwaSheet } from "@/components/InstallPwa/InstallPwaSheet";
import { getPendingCrewInvites } from "@/lib/data/crew-queries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useTheme, THEME_META, type ThemeName } from "@/lib/theme";
import { savePushSubscription, removePushSubscription } from "@/app/(app)/actions";
import { setAllowCrewInvites } from "@/app/crew/actions";
import {
  isStandalonePwa,
  pushSupported,
  readPushStatus,
  subscribeDevice,
  unsubscribeDevice,
  type PushStatus,
} from "@/lib/push/client";
import { showToast } from "@/components/ui";
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
 * Profile tab dropdown — available from every authed screen so
 * account + notifications don't require a trip to the profile page:
 *
 *   • View profile  → /u/username
 *   • Notifications → opens the shared NotificationsSheet
 *   • Settings → nested submenu with edit profile, change gym,
 *                crew invite toggle, push toggle, theme picker,
 *                privacy link, sign out, delete account
 *
 * Owns every dialog/sheet it opens so the state lives in one place
 * regardless of the viewer's current page. Profile data comes from
 * `useAuth`; pending invites are fetched client-side once per user.
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
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gymSwitcherOpen, setGymSwitcherOpen] = useState(false);
  const [installSheetOpen, setInstallSheetOpen] = useState(false);

  // Optimistic mirror of the persisted flag so the label flips
  // immediately on tap. Derived-from-prop via setState-during-render
  // (React's sanctioned pattern) — avoids the `set-state-in-effect`
  // lint violation a useEffect sync would trip.
  const [allowInvites, setAllowInvites] = useState<boolean>(
    profile?.allow_crew_invites ?? true,
  );
  const [lastProfileFlag, setLastProfileFlag] = useState<boolean | null>(
    profile?.allow_crew_invites ?? null,
  );
  if (profile && profile.allow_crew_invites !== lastProfileFlag) {
    setLastProfileFlag(profile.allow_crew_invites);
    setAllowInvites(profile.allow_crew_invites);
  }

  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const rows = await getPendingCrewInvites(supabase, userId);
      if (!cancelled) setInvites(rows);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    readPushStatus().then((s) => { if (!cancelled) setPushStatus(s); });
    return () => { cancelled = true; };
  }, []);

  const handleToggleAllowInvites = useCallback(async () => {
    const next = !allowInvites;
    setAllowInvites(next);
    const res = await setAllowCrewInvites(next);
    if ("error" in res) {
      setAllowInvites(!next);
      showToast(res.error, "error");
      return;
    }
    showToast(next ? "Crew invites on" : "Crew invites off", "info");
  }, [allowInvites]);

  const handleTogglePush = useCallback(async () => {
    // iOS Safari needs the home-screen install for push to work
    // reliably; forcing the install gate on every platform keeps
    // the enable path consistent. Allow disabling anywhere.
    if (pushStatus !== "subscribed" && !isStandalonePwa()) {
      setInstallSheetOpen(true);
      return;
    }
    if (pushStatus === "subscribed") {
      const { endpoint } = await unsubscribeDevice();
      if (endpoint) {
        const res = await removePushSubscription(endpoint);
        if ("error" in res) {
          showToast(res.error, "error");
          return;
        }
      }
      setPushStatus("granted");
      showToast("Notifications off", "info");
      return;
    }

    const result = await subscribeDevice();
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    const res = await savePushSubscription(result);
    if ("error" in res) {
      showToast(res.error, "error");
      return;
    }
    setPushStatus("subscribed");
    showToast("Notifications on", "success");
  }, [pushStatus]);

  const pushMenuVisible =
    pushSupported() &&
    pushStatus !== null &&
    pushStatus !== "unsupported" &&
    pushStatus !== "denied";

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
            aria-current={profileActive ? "page" : undefined}
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
                <span className={styles.itemLabel}>View profile</span>
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
              <span className={styles.itemLabel}>Notifications</span>
              {badgeCount > 0 && (
                <span className={styles.itemCount}>{badgeCount}</span>
              )}
            </Dropdown.Item>

            <Dropdown.Separator className={styles.separator} />

            {profile && (
              <Dropdown.Sub>
                <Dropdown.SubTrigger className={styles.item}>
                  <FaGear aria-hidden className={styles.itemIcon} />
                  <span className={styles.itemLabel}>Settings</span>
                  <span className={styles.chevron} aria-hidden>›</span>
                </Dropdown.SubTrigger>
                <Dropdown.Portal>
                  <Dropdown.SubContent
                    className={styles.menu}
                    sideOffset={4}
                    alignOffset={-4}
                  >
                    <Dropdown.Item
                      className={styles.item}
                      onSelect={(e) => { e.preventDefault(); setEditOpen(true); }}
                    >
                      <FaPen aria-hidden className={styles.itemIcon} />
                      <span className={styles.itemLabel}>Edit profile</span>
                    </Dropdown.Item>

                    <Dropdown.Item
                      className={styles.item}
                      onSelect={(e) => { e.preventDefault(); setGymSwitcherOpen(true); }}
                    >
                      <FaRightLeft aria-hidden className={styles.itemIcon} />
                      <span className={styles.itemLabel}>Change gym</span>
                    </Dropdown.Item>

                    <Dropdown.Item
                      className={styles.item}
                      onSelect={(e) => { e.preventDefault(); handleToggleAllowInvites(); }}
                    >
                      {allowInvites ? (
                        <FaUsersSlash aria-hidden className={styles.itemIcon} />
                      ) : (
                        <FaUsers aria-hidden className={styles.itemIcon} />
                      )}
                      <span className={styles.itemLabel}>
                        {allowInvites ? "Disable crew invites" : "Allow crew invites"}
                      </span>
                    </Dropdown.Item>

                    {pushMenuVisible && (
                      <Dropdown.Item
                        className={styles.item}
                        onSelect={(e) => { e.preventDefault(); handleTogglePush(); }}
                      >
                        {pushStatus === "subscribed" ? (
                          <FaBellSlash aria-hidden className={styles.itemIcon} />
                        ) : (
                          <FaBell aria-hidden className={styles.itemIcon} />
                        )}
                        <span className={styles.itemLabel}>
                          {pushStatus === "subscribed"
                            ? "Turn off push"
                            : "Turn on push"}
                        </span>
                      </Dropdown.Item>
                    )}

                    <Dropdown.Separator className={styles.separator} />

                    {/* Theme picker — nested submenu of its own so the
                        six palettes don't crowd the settings list. */}
                    <Dropdown.Sub>
                      <Dropdown.SubTrigger className={styles.item}>
                        <FaPalette aria-hidden className={styles.itemIcon} />
                        <span className={styles.itemLabel}>Theme</span>
                        <span className={styles.itemTrailing}>
                          {THEME_META.find((t) => t.id === theme)?.label ?? ""}
                        </span>
                        <span className={styles.chevron} aria-hidden>›</span>
                      </Dropdown.SubTrigger>
                      <Dropdown.Portal>
                        <Dropdown.SubContent
                          className={styles.menu}
                          sideOffset={4}
                          alignOffset={-4}
                        >
                          {THEME_META.map((t) => (
                            <Dropdown.Item
                              key={t.id}
                              className={styles.item}
                              onSelect={(e) => {
                                e.preventDefault();
                                setTheme(t.id as ThemeName);
                              }}
                            >
                              {theme === t.id ? (
                                <FaCheck aria-hidden className={styles.itemIcon} />
                              ) : (
                                <span className={styles.itemIcon} aria-hidden />
                              )}
                              <span className={styles.itemLabel}>{t.label}</span>
                              <span className={styles.itemTrailing}>
                                {t.swatches.map((c, i) => (
                                  <span
                                    key={i}
                                    className={styles.swatch}
                                    style={{ background: c }}
                                    aria-hidden
                                  />
                                ))}
                              </span>
                            </Dropdown.Item>
                          ))}
                        </Dropdown.SubContent>
                      </Dropdown.Portal>
                    </Dropdown.Sub>

                    <Dropdown.Separator className={styles.separator} />

                    <Dropdown.Item asChild className={styles.item}>
                      <Link href="/privacy">
                        <FaShieldHalved aria-hidden className={styles.itemIcon} />
                        <span className={styles.itemLabel}>Privacy policy</span>
                      </Link>
                    </Dropdown.Item>

                    <Dropdown.Item
                      className={`${styles.item} ${styles.itemWarning}`}
                      onSelect={(e) => { e.preventDefault(); signOut(); }}
                    >
                      <FaRightFromBracket aria-hidden className={styles.itemIcon} />
                      <span className={styles.itemLabel}>Sign out</span>
                    </Dropdown.Item>

                    <Dropdown.Item
                      className={`${styles.item} ${styles.itemDanger}`}
                      onSelect={(e) => { e.preventDefault(); setDeleteOpen(true); }}
                    >
                      <FaTrash aria-hidden className={styles.itemIcon} />
                      <span className={styles.itemLabel}>Delete account</span>
                    </Dropdown.Item>
                  </Dropdown.SubContent>
                </Dropdown.Portal>
              </Dropdown.Sub>
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      <NotificationsSheet
        invites={invites}
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {profile && (
        <>
          <EditProfileDialog
            user={profile}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <DeleteAccountDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
          <GymSwitcherSheet
            open={gymSwitcherOpen}
            onClose={() => setGymSwitcherOpen(false)}
            activeGymId={profile.active_gym_id ?? null}
          />
          <InstallPwaSheet
            open={installSheetOpen}
            onClose={() => setInstallSheetOpen(false)}
          />
        </>
      )}
    </>
  );
}
