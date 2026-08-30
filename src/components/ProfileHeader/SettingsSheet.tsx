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
  FaChevronLeft,
} from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ThemePreview } from "@/components/ui/ThemePreview/ThemePreview";
// SettingsSheet is intentionally a roll-up of feature-owned dialogs.
// Each dialog stays in its own feature folder; this surface composes
// them into one entry point.
/* eslint-disable no-restricted-imports */
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import { GymPickerPanel } from "@/components/GymSwitcher/GymPickerPanel";
import { InstallPwaPanel } from "@/components/InstallPwa/InstallPwaPanel";
/* eslint-enable no-restricted-imports */
import { useAuth } from "@/lib/auth-context";
import { useTheme, THEME_META, type ThemeName } from "@/lib/theme";
import type { PushCategoryKey } from "@/app/profile/actions";
import { useSettingsState } from "./useSettingsState";
import type { SettingsPanel } from "./settingsReducer";
import styles from "./settingsSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Human title per pane, also used as the sheet's accessible name. */
const PANEL_TITLES: Record<SettingsPanel, string> = {
  edit: "Edit profile",
  delete: "Delete account",
  "gym-switcher": "Change gym",
  install: "Install Chork",
  theme: "Theme",
  notifications: "Notifications",
};

/** Panes that render inline and slide; the rest stay modal dialogs. */
const SLIDING_PANELS = ["gym-switcher", "install", "theme", "notifications"] as const;
type SlidingPanel = (typeof SLIDING_PANELS)[number];

function isSliding(panel: SettingsPanel | null): panel is SlidingPanel {
  return (SLIDING_PANELS as readonly (string | null)[]).includes(panel);
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

  const sliding = isSliding(activePanel) ? activePanel : null;

  // Closing the sheet also drops the pane, so re-opening always lands
  // on the menu rather than wherever the climber left off.
  function handleSheetClose() {
    closePanel();
    onClose();
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={handleSheetClose}
        title={sliding ? PANEL_TITLES[sliding] : "Settings"}
        titleSlot={
          sliding ? (
            <div className={styles.panelBar}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={closePanel}
                aria-label="Back to settings"
              >
                <FaChevronLeft />
              </button>
              <span className={styles.panelTitle}>{PANEL_TITLES[sliding]}</span>
            </div>
          ) : undefined
        }
      >
        {/* One pane at a time. Rendering both would size the sheet to
            the taller of them and leave dead space under the shorter. */}
        {sliding === null && (
        <div className={`${styles.list} ${styles.pane}`}>
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
        )}

        {sliding === "notifications" && (
        <div className={`${styles.list} ${styles.pane}`}>
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
        )}

        {sliding === "theme" && (
        <div className={styles.themeList}>
          {THEME_META.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.themeItem}
              // The button is the control; the preview inside it is
              // decoration, so the accessible name and checked state
              // live here rather than on the artwork.
              aria-pressed={theme === t.id}
              onClick={() => {
                setTheme(t.id as ThemeName);
              }}
            >
              <ThemePreview theme={t.id} />
              <span className={styles.themeText}>
                <span className={styles.themeLabel}>
                  {theme === t.id ? (
                    <FaCheck aria-hidden className={styles.themeCheck} />
                  ) : (
                    <span className={styles.themeCheck} aria-hidden />
                  )}
                  {t.label}
                </span>
                <span className={styles.themeHint}>{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
        )}

        {sliding === "gym-switcher" && profile && (
          <div className={styles.pane}>
            <GymPickerPanel
              open
              onClose={handleSheetClose}
              activeGymId={profile.active_gym_id ?? null}
            />
          </div>
        )}

        {sliding === "install" && (
          <div className={styles.pane}>
            <InstallPwaPanel />
          </div>
        )}
      </BottomSheet>

      {/* Edit and Delete stay modal rather than sliding. A form with
          its own submit, and a destructive confirm, both want to be
          dismissible on their own terms — sliding them into the menu
          would make "back" ambiguous mid-edit. */}
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
