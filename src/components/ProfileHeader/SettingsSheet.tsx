"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FaBell,
  FaBellSlash,
  FaPen,
  FaRightLeft,
  FaUsers,
  FaUsersSlash,
  FaPalette,
  FaCheck,
  FaShieldHalved,
  FaRightFromBracket,
  FaTrash,
  FaChevronRight,
  FaScrewdriverWrench,
} from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import { GymSwitcherSheet } from "@/components/GymSwitcher/GymSwitcherSheet";
import { InstallPwaSheet } from "@/components/InstallPwa/InstallPwaSheet";
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
import styles from "./settingsSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  /** When true, an "Admin" link is rendered — routes to /admin. */
  isAdmin: boolean;
}

/**
 * Settings bottom sheet — every account-level action in one panel.
 * Replaces the old nav-level Radix dropdown so settings live close
 * to the climber's identity on the profile page rather than being
 * tucked inside a nav submenu.
 */
export function SettingsSheet({ open, onClose, isAdmin }: Props) {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gymSwitcherOpen, setGymSwitcherOpen] = useState(false);
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

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

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Settings">
        <div className={styles.list}>
          {isAdmin && (
            <Link
              href="/admin"
              className={styles.item}
              onClick={onClose}
            >
              <FaScrewdriverWrench aria-hidden className={styles.icon} />
              <span className={styles.label}>Admin dashboard</span>
              <FaChevronRight className={styles.chevron} aria-hidden />
            </Link>
          )}

          <button
            type="button"
            className={styles.item}
            onClick={() => setEditOpen(true)}
          >
            <FaPen aria-hidden className={styles.icon} />
            <span className={styles.label}>Edit profile</span>
          </button>

          <button
            type="button"
            className={styles.item}
            onClick={() => setGymSwitcherOpen(true)}
          >
            <FaRightLeft aria-hidden className={styles.icon} />
            <span className={styles.label}>Change gym</span>
          </button>

          <button
            type="button"
            className={styles.item}
            onClick={handleToggleAllowInvites}
          >
            {allowInvites ? (
              <FaUsersSlash aria-hidden className={styles.icon} />
            ) : (
              <FaUsers aria-hidden className={styles.icon} />
            )}
            <span className={styles.label}>
              {allowInvites ? "Disable crew invites" : "Allow crew invites"}
            </span>
          </button>

          {pushMenuVisible && (
            <button
              type="button"
              className={styles.item}
              onClick={handleTogglePush}
            >
              {pushStatus === "subscribed" ? (
                <FaBellSlash aria-hidden className={styles.icon} />
              ) : (
                <FaBell aria-hidden className={styles.icon} />
              )}
              <span className={styles.label}>
                {pushStatus === "subscribed" ? "Turn off push" : "Turn on push"}
              </span>
            </button>
          )}

          <button
            type="button"
            className={styles.item}
            onClick={() => setThemeOpen(true)}
          >
            <FaPalette aria-hidden className={styles.icon} />
            <span className={styles.label}>Theme</span>
            <span className={styles.trailing}>
              {THEME_META.find((t) => t.id === theme)?.label ?? ""}
            </span>
            <FaChevronRight className={styles.chevron} aria-hidden />
          </button>

          <div className={styles.divider} />

          <Link
            href="/privacy"
            className={styles.item}
            onClick={onClose}
          >
            <FaShieldHalved aria-hidden className={styles.icon} />
            <span className={styles.label}>Privacy policy</span>
          </Link>

          <button
            type="button"
            className={`${styles.item} ${styles.itemWarning}`}
            onClick={() => signOut()}
          >
            <FaRightFromBracket aria-hidden className={styles.icon} />
            <span className={styles.label}>Sign out</span>
          </button>

          <button
            type="button"
            className={`${styles.item} ${styles.itemDanger}`}
            onClick={() => setDeleteOpen(true)}
          >
            <FaTrash aria-hidden className={styles.icon} />
            <span className={styles.label}>Delete account</span>
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        title="Theme"
      >
        <div className={styles.list}>
          {THEME_META.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.item}
              onClick={() => {
                setTheme(t.id as ThemeName);
              }}
            >
              {theme === t.id ? (
                <FaCheck aria-hidden className={styles.icon} />
              ) : (
                <span className={styles.icon} aria-hidden />
              )}
              <span className={styles.label}>{t.label}</span>
              <span className={styles.trailing}>
                {t.swatches.map((c, i) => (
                  <span
                    key={i}
                    className={styles.swatch}
                    style={{ background: c }}
                    aria-hidden
                  />
                ))}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

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

