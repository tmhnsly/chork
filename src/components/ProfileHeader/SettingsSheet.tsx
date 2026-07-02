"use client";

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
} from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
// SettingsSheet is intentionally a roll-up of feature-owned dialogs.
// Each dialog stays in its own feature folder; this surface composes
// them into one entry point.
/* eslint-disable no-restricted-imports */
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import { GymSwitcherSheet } from "@/components/GymSwitcher/GymSwitcherSheet";
import { InstallPwaSheet } from "@/components/InstallPwa/InstallPwaSheet";
/* eslint-enable no-restricted-imports */
import { useAuth } from "@/lib/auth-context";
import { useTheme, THEME_META, type ThemeName } from "@/lib/theme";
import type { PushCategoryKey } from "@/lib/user-actions";
import { useSettingsState } from "./useSettingsState";
import styles from "./settingsSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Settings bottom sheet — every account-level action in one panel.
 * Replaces the old nav-level Radix dropdown so settings live close
 * to the climber's identity on the profile page rather than being
 * tucked inside a nav submenu.
 *
 * Admin entry moved out: admins see an Admin tab in the bottom nav
 * (NavBar) instead of a row buried in this sheet.
 *
 * All local state (sub-panel routing + optimistic toggle mirrors)
 * lives in `useSettingsState` / `settingsReducer` — this component
 * is JSX + prop bridging only.
 */
export function SettingsSheet({ open, onClose }: Props) {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const {
    state,
    pushMenuVisible,
    openPanel,
    closePanel,
    handleToggleAllowInvites,
    handleTogglePush,
    handleToggleNotif,
  } = useSettingsState(profile);
  const { activePanel, allowInvites, notifFlags, pushStatus } = state;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Settings">
        <div className={styles.list}>
          <button
            type="button"
            className={styles.item}
            onClick={() => openPanel("edit")}
          >
            <FaPen aria-hidden className={styles.icon} />
            <span className={styles.label}>Edit profile</span>
          </button>

          <button
            type="button"
            className={styles.item}
            onClick={() => openPanel("gym-switcher")}
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

          {pushStatus === "subscribed" && (
            <button
              type="button"
              className={styles.item}
              onClick={() => openPanel("notifications")}
            >
              <FaBell aria-hidden className={styles.icon} />
              <span className={styles.label}>Notifications</span>
              <FaChevronRight className={styles.chevron} aria-hidden />
            </button>
          )}

          <button
            type="button"
            className={styles.item}
            onClick={() => openPanel("theme")}
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
            onClick={() => openPanel("delete")}
          >
            <FaTrash aria-hidden className={styles.icon} />
            <span className={styles.label}>Delete account</span>
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={activePanel === "notifications"}
        onClose={closePanel}
        title="Notifications"
        description="Pick which pushes you'd like to receive"
      >
        <div className={styles.list}>
          {NOTIF_ROWS.map((row) => (
            <button
              key={row.category}
              type="button"
              className={styles.item}
              onClick={() => handleToggleNotif(row.category)}
            >
              <FaBell aria-hidden className={styles.icon} />
              <span className={styles.label}>{row.label}</span>
              <span className={styles.trailing}>
                {notifFlags[row.category] ? "On" : "Off"}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={activePanel === "theme"}
        onClose={closePanel}
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
                    style={{ "--swatch": c } as React.CSSProperties}
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
            open={activePanel === "edit"}
            onOpenChange={(o) => (o ? openPanel("edit") : closePanel())}
          />
          <DeleteAccountDialog
            open={activePanel === "delete"}
            onOpenChange={(o) => (o ? openPanel("delete") : closePanel())}
          />
          <GymSwitcherSheet
            open={activePanel === "gym-switcher"}
            onClose={closePanel}
            activeGymId={profile.active_gym_id ?? null}
          />
          <InstallPwaSheet
            open={activePanel === "install"}
            onClose={closePanel}
          />
        </>
      )}
    </>
  );
}

const NOTIF_ROWS: { category: PushCategoryKey; label: string }[] = [
  { category: "invite_received", label: "New crew invite" },
  { category: "invite_accepted", label: "Invite accepted" },
  { category: "ownership_changed", label: "Made crew creator" },
];
